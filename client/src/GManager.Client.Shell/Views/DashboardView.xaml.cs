using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using GManager.Client.Domain;
using GManager.Client.Shell.Dashboard;

namespace GManager.Client.Shell.Views;

public partial class DashboardView : UserControl, INotifyPropertyChanged
{
    readonly ObservableCollection<ApplicationTile> tiles = [];
    readonly UserPreferencesStore store = new(Environment.GetCommandLineArgs().Contains("--development", StringComparer.OrdinalIgnoreCase));
    readonly DispatcherTimer saveTimer = new() { Interval = TimeSpan.FromMilliseconds(400) };
    static readonly CultureInfo LocalCulture = CultureInfo.GetCultureInfo("sr-Latn-RS");
    IReadOnlyList<ClientApplication> allowed = [];
    UserPreferences preferences = new();
    Guid? sessionId;
    DateTimeOffset? plannedEnd;
    string? profileKey, pendingAccountKey;
    int profileGeneration, timerLevel = -1;
    bool profileReady, warning15, warning5, connectionKnown, lastConnected, navigating;
    ClientMode? lastMode;
    DateTimeOffset? toastUntil;
    string search = "", customerName = "Korisnik", remainingText = "-:-:-", endsText = "Podatak nije dostupan";
    string sessionStatus = "Sesija je aktivna", connectionLabel = "Provera veze", connectionDetail = "Povezivanje sa servisom…";
    string localTime = "", localDate = "", timerMessage = "Vreme prema aktivnoj sesiji", toast = "";
    string preferencesStatus = "Podešavanja se čuvaju lokalno za tvoj nalog.";
    bool onlyFavorites, canInteract, showInformationPanel;
    Brush connectionBrush = Brushes.Transparent, toastBrush = Brushes.Transparent;
    int applicationColumns = 4;
    double tileHeight = 232, timerFontSize = 70, welcomeFontSize = 34;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action<string>? LaunchRequested;
    public event Action? LogoutRequested;
    public ObservableCollection<DashboardNotification> Notifications { get; } = [];
    public ICollectionView ApplicationView { get; }
    public UserPreferences Preferences => preferences;
    public string StationName => Environment.MachineName;
    public string ClientVersion => "v" + (typeof(DashboardView).Assembly.GetName().Version?.ToString(3) ?? "1.0.0");
    public string CustomerName { get => customerName; private set { if (Set(ref customerName, value)) { Changed(nameof(WelcomeText)); Changed(nameof(Initials)); } } }
    public string WelcomeText => $"Dobro došao, {CustomerName}!";
    public string Initials => string.Concat(CustomerName.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2).Select(x => StringInfo.GetNextTextElement(x))).ToUpper(LocalCulture);
    public string RemainingText { get => remainingText; private set => Set(ref remainingText, value); }
    public string EndsText { get => endsText; private set => Set(ref endsText, value); }
    public string SessionStatus { get => sessionStatus; private set => Set(ref sessionStatus, value); }
    public string TimerMessage { get => timerMessage; private set => Set(ref timerMessage, value); }
    public string ConnectionLabel { get => connectionLabel; private set => Set(ref connectionLabel, value); }
    public string ConnectionDetail { get => connectionDetail; private set => Set(ref connectionDetail, value); }
    public Brush ConnectionBrush { get => connectionBrush; private set => Set(ref connectionBrush, value); }
    public string LocalTime { get => localTime; private set => Set(ref localTime, value); }
    public string LocalDate { get => localDate; private set => Set(ref localDate, value); }
    public bool CanInteract { get => canInteract; private set => Set(ref canInteract, value); }
    public bool HasSession => sessionId is not null;
    public bool ProfileReady { get => profileReady; private set => Set(ref profileReady, value); }
    public int ApplicationColumns { get => applicationColumns; private set => Set(ref applicationColumns, value); }
    public double TileHeight { get => tileHeight; private set => Set(ref tileHeight, value); }
    public double TimerFontSize { get => timerFontSize; private set => Set(ref timerFontSize, value); }
    public double WelcomeFontSize { get => welcomeFontSize; private set => Set(ref welcomeFontSize, value); }
    public string PreferencesStatus { get => preferencesStatus; private set => Set(ref preferencesStatus, value); }
    public string Toast { get => toast; private set { if (Set(ref toast, value)) Changed(nameof(HasToast)); } }
    public bool HasToast => Toast.Length > 0;
    public Brush ToastBrush { get => toastBrush; private set => Set(ref toastBrush, value); }
    public bool ShowInformationPanel { get => showInformationPanel; set { if (Set(ref showInformationPanel, value)) UpdateInformationPanel(); } }
    public bool OnlyFavorites { get => onlyFavorites; set { if (Set(ref onlyFavorites, value)) RefreshFilter(); } }
    public string Search { get => search; set { if (Set(ref search, value)) RefreshFilter(); } }
    public bool NoResults => ApplicationView.IsEmpty;
    public string EmptyTitle => allowed.Count == 0 ? "Trenutno nema dostupnih aplikacija." : "Nema rezultata.";
    public string EmptyMessage => allowed.Count == 0 ? "Osoblje upravlja aplikacijama za ovu stanicu." : "Promeni pretragu ili isključi filter favorita.";
    public string ApplicationCount => $"PRIKAZANO: {ApplicationView.Cast<object>().Count()} / {allowed.Count}";

    public DashboardView()
    {
        ApplicationView = CollectionViewSource.GetDefaultView(tiles);
        ApplicationView.Filter = item => item is ApplicationTile tile &&
            (!OnlyFavorites || tile.IsFavorite) && tile.Name.Contains(Search.Trim(), StringComparison.CurrentCultureIgnoreCase);
        ApplicationView.SortDescriptions.Add(new(nameof(ApplicationTile.IsFavorite), ListSortDirection.Descending));
        ApplicationView.SortDescriptions.Add(new(nameof(ApplicationTile.Name), ListSortDirection.Ascending));
        InitializeComponent();
        DataContext = this;
        preferences.PropertyChanged += Preferences_Changed;
        saveTimer.Tick += async (_, _) => { saveTimer.Stop(); await SavePreferencesAsync(); };
        Unloaded += (_, _) => FlushPreferences();
        ApplyAppearance();
        UpdateLocalClock(DateTimeOffset.Now);
    }

    public void PrepareAccount(string email) => pendingAccountKey = UserPreferencesStore.AccountKey(email);

    public void UpdateSession(ClientViewState state, IReadOnlyList<ClientApplication> applications, TimeSpan remaining,
        bool available, bool busy)
    {
        if (state.SessionId != sessionId)
        {
            FlushPreferences();
            sessionId = state.SessionId;
            plannedEnd = state.EndsAt;
            Notifications.Clear();
            warning15 = warning5 = connectionKnown = false;
            Search = "";
            OnlyFavorites = false;
            NavigateTo(AppsNavigation, false);
            profileKey = pendingAccountKey ?? "session:" + state.SessionId;
            pendingAccountKey = null;
            _ = LoadPreferencesAsync(profileKey);
            Notify("Gaming sesija je aktivirana. Uživaj u igri!");
        }
        CustomerName = string.IsNullOrWhiteSpace(state.CustomerName) ? "Korisnik" : state.CustomerName;
        EndsText = state.EndsAt?.ToLocalTime().ToString("dd.MM.yyyy. · HH:mm", LocalCulture) ?? "Podatak nije dostupan";
        if (plannedEnd != state.EndsAt) Notify($"Planirani završetak sesije je ažuriran: {EndsText}.");
        plannedEnd = state.EndsAt;
        if (!allowed.SequenceEqual(applications))
        {
            allowed = applications.ToArray();
            RebuildTiles();
        }
        UpdateConnection(state, available);
        UpdateCountdown(remaining, state.EndsAt is not null);
        SetBusy(busy, available && state.SessionId is not null && state.Mode == ClientMode.Active && (state.EndsAt is null || remaining > TimeSpan.Zero));
    }

    public void SetBusy(bool busy, bool permitted) => CanInteract = !busy && permitted;

    public void UpdateCountdown(TimeSpan remaining, bool known)
    {
        remaining = remaining < TimeSpan.Zero ? TimeSpan.Zero : remaining;
        if (known && remaining == TimeSpan.Zero) { CanInteract = false; CloseLogout(); }
        RemainingText = known ? $"{(int)remaining.TotalHours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}" : "-:-:-";
        int level = !known ? 0 : remaining <= TimeSpan.Zero ? 3 : remaining.TotalMinutes < 5 ? 2 : remaining.TotalMinutes <= 15 ? 1 : 0;
        if (timerLevel != level)
        {
            timerLevel = level;
            Resources["TimerAccent"] = FindResource(level >= 2 ? "Danger" : level == 1 ? "Warning" : "Primary");
        }
        SessionStatus = level switch { 3 => "Sesija je istekla", 2 => "Poslednji minuti", 1 => "Vreme uskoro ističe", _ => "Sesija je aktivna" };
        TimerMessage = level switch
        {
            3 => "Vreme je isteklo. Obrati se osoblju za novu sesiju.",
            2 => "Sačuvaj svoj napredak. Preostalo je manje od 5 minuta.",
            1 => "Za produženje sesije obrati se osoblju.",
            _ => "Ukupno trajanje nije dostupno · vreme prema servisu"
        };
        if (remaining.TotalMinutes > 15) warning15 = false;
        if (remaining.TotalMinutes >= 5) warning5 = false;
        if (!known || !ProfileReady || !Preferences.ExpiryWarning || sessionId is null) return;
        if (level == 2 && !warning5)
        {
            warning5 = warning15 = true;
            Notify("Sesija ističe za manje od 5 minuta. Sačuvaj napredak ili se obrati osoblju za produženje.", true);
        }
        else if (level == 1 && !warning15)
        {
            warning15 = true;
            Notify("Preostalo je najviše 15 minuta sesije. Za produženje se obrati osoblju.", true);
        }
    }

    public void UpdateConnection(ClientViewState state, bool available)
    {
        bool online = available && state.Mode != ClientMode.Offline && state.ServerConnected == true;
        bool disconnected = !available || state.Mode == ClientMode.Offline || state.ServerConnected == false;
        ConnectionLabel = online ? "Povezano" : disconnected ? "Nema konekcije" : "Provera veze";
        ConnectionDetail = !available ? "Lokalni servis nije dostupan. Ponovno povezivanje je u toku…"
            : disconnected ? "Server nije dostupan" : online ? "Povezano sa serverom"
            : "Servis je dostupan; veza sa serverom još nije potvrđena.";
        ConnectionBrush = (Brush)FindResource(online ? "Connected" : disconnected ? "Danger" : "Primary");
        if (connectionKnown && online != lastConnected)
            Notify(online ? "Veza sa servisom je ponovo uspostavljena." : "Veza sa serverom ili lokalnim servisom je prekinuta.", !online);
        connectionKnown = true;
        lastConnected = online;
    }

    public void UpdateLocalClock(DateTimeOffset now)
    {
        LocalTime = now.ToString("HH:mm:ss", LocalCulture);
        LocalDate = now.ToString("ddd, dd.MM.yyyy.", LocalCulture);
        if (toastUntil is not null && now >= toastUntil) { Toast = ""; toastUntil = null; }
    }

    public void NotifyMode(ClientMode mode)
    {
        if (lastMode == mode) return;
        if (sessionId is not null && lastMode is not null)
            Notify(mode switch
            {
                ClientMode.Active => "Sesija je ponovo aktivna.",
                ClientMode.Offline => "Veza sa serverom je prekinuta.",
                ClientMode.Maintenance => "Stanica prelazi u režim održavanja.",
                _ => "Stanje gaming sesije je promenjeno."
            }, mode != ClientMode.Active);
        lastMode = mode;
        if (mode != ClientMode.Active) CloseLogout();
    }

    public void EndSession()
    {
        FlushPreferences();
        profileGeneration++;
        profileKey = pendingAccountKey = null;
        sessionId = null;
        allowed = [];
        tiles.Clear();
        Notifications.Clear();
        Toast = "";
        CustomerName = "Korisnik";
        CanInteract = ProfileReady = false;
        ReplacePreferences(new());
        CloseLogout();
    }

    public void Notify(string message, bool warning = false)
    {
        if (Notifications.FirstOrDefault()?.Message == message) return;
        Notifications.Insert(0, new(message, DateTimeOffset.Now.ToString("HH:mm", LocalCulture), warning));
        while (Notifications.Count > 8) Notifications.RemoveAt(Notifications.Count - 1);
        Toast = message;
        ToastBrush = (Brush)FindResource(warning ? "Danger" : "PrimaryText");
        toastUntil = DateTimeOffset.Now.AddSeconds(warning ? 12 : 6);
        if (warning && Preferences.NotificationSound) PlaySound(true);
    }

    async Task LoadPreferencesAsync(string key)
    {
        int generation = ++profileGeneration;
        ProfileReady = false;
        SettingsPage.IsEnabled = false;
        ReplacePreferences(new());
        var loaded = await store.LoadAsync(key);
        if (generation != profileGeneration || profileKey != key) return;
        ReplacePreferences(loaded);
        PreferencesStatus = key.StartsWith("session:", StringComparison.Ordinal)
            ? "Identitet naloga nije dostupan; podešavanja su odvojena za ovu sesiju."
            : "Podešavanja i favoriti čuvaju se lokalno za tvoj nalog.";
        ProfileReady = true;
        SettingsPage.IsEnabled = true;
        RebuildTiles();
    }

    void ReplacePreferences(UserPreferences value)
    {
        preferences.PropertyChanged -= Preferences_Changed;
        preferences = value;
        preferences.PropertyChanged += Preferences_Changed;
        Changed(nameof(Preferences));
        ApplyAppearance();
    }

    void Preferences_Changed(object? sender, PropertyChangedEventArgs e)
    {
        ApplyAppearance();
        if (!ProfileReady) return;
        saveTimer.Stop();
        saveTimer.Start();
    }

    async Task SavePreferencesAsync()
    {
        if (profileKey is null || !ProfileReady) return;
        string key = profileKey;
        try { await store.SaveAsync(key, Preferences); }
        catch (Exception ex) when (ex is System.IO.IOException or UnauthorizedAccessException)
        {
            if (profileKey != key) return;
            PreferencesStatus = "Podešavanja rade u ovoj sesiji, ali lokalno čuvanje nije uspelo.";
            Notify("UI podešavanja nije moguće sačuvati na ovom računaru.", true);
        }
    }

    public void FlushPreferences()
    {
        if (!saveTimer.IsEnabled) return;
        saveTimer.Stop();
        _ = SavePreferencesAsync();
    }

    void RebuildTiles()
    {
        tiles.Clear();
        foreach (var application in allowed)
            tiles.Add(new(application, Preferences.Favorites.Contains(application.Code)));
        RefreshFilter();
    }

    void RefreshFilter()
    {
        ApplicationView.Refresh();
        Changed(nameof(NoResults)); Changed(nameof(EmptyTitle)); Changed(nameof(EmptyMessage)); Changed(nameof(ApplicationCount));
    }

    void Favorite_Click(object sender, RoutedEventArgs e)
    {
        if (!ProfileReady || sender is not ToggleButton { DataContext: ApplicationTile tile } || !allowed.Any(x => x.Code == tile.Code)) return;
        if (tile.IsFavorite) Preferences.Favorites.Add(tile.Code); else Preferences.Favorites.Remove(tile.Code);
        RefreshFilter();
        saveTimer.Stop(); saveTimer.Start();
        InterfaceSound();
    }

    void Launch_Click(object sender, RoutedEventArgs e)
    {
        if (!CanInteract || sender is not Button { Tag: string code } || !allowed.Any(x => x.Code == code)) return;
        InterfaceSound();
        LaunchRequested?.Invoke(code);
    }

    void Navigate_Checked(object sender, RoutedEventArgs e)
    {
        if (HelpPage is not null && sender is RadioButton button) NavigateTo(button, true);
    }

    void NavigateTo(RadioButton selected, bool animate)
    {
        if (navigating) return;
        navigating = true;
        try
        {
            foreach (var (button, page) in new (RadioButton, ScrollViewer)[]
            {
                (AppsNavigation, ApplicationsPage), (InfoNavigation, InformationPage),
                (SettingsNavigation, SettingsPage), (HelpNavigation, HelpPage)
            })
            {
                bool active = selected == button;
                button.IsChecked = active;
                page.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
                page.BeginAnimation(OpacityProperty, null);
                page.Opacity = 1;
                if (active && animate && Preferences.Animations && SystemParameters.ClientAreaAnimation)
                    page.BeginAnimation(OpacityProperty, new DoubleAnimation(0.5, 1, TimeSpan.FromMilliseconds(160)) { FillBehavior = FillBehavior.Stop });
            }
            if (animate) InterfaceSound();
        }
        finally { navigating = false; }
    }

    void RequestLogout_Click(object sender, RoutedEventArgs e)
    {
        if (!CanInteract) return;
        InterfaceSound();
        DashboardContent.IsEnabled = false;
        LogoutOverlay.Visibility = Visibility.Visible;
        CancelLogout.Focus();
    }

    void CancelLogout_Click(object sender, RoutedEventArgs e) => CloseLogout();
    void ConfirmLogout_Click(object sender, RoutedEventArgs e)
    {
        if (!CanInteract) { CloseLogout(); return; }
        CloseLogout();
        FlushPreferences();
        LogoutRequested?.Invoke();
    }

    public void CloseLogout()
    {
        bool open = LogoutOverlay.Visibility == Visibility.Visible;
        LogoutOverlay.Visibility = Visibility.Collapsed;
        DashboardContent.IsEnabled = true;
        if (open) SidebarLogout.Focus();
    }

    void Dashboard_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Escape || LogoutOverlay.Visibility != Visibility.Visible) return;
        CloseLogout(); e.Handled = true;
    }

    void ApplyAppearance()
    {
        if (AmbientLight is null) return;
        double intensity = Preferences.NeonTheme ? Preferences.NeonIntensity / 100 : 0;
        AmbientLight.Opacity = intensity * 0.5;
        TimerGlow.Opacity = intensity * 0.2;
        Resources["DashboardSurface"] = new SolidColorBrush(Preferences.NeonTheme ? Color.FromArgb(235, 18, 21, 28) : Color.FromRgb(18, 21, 28));
        Resources["DashboardBorder"] = new SolidColorBrush(Preferences.NeonTheme ? Color.FromArgb((byte)(65 + intensity * 80), 54, 64, 80) : Color.FromArgb(90, 54, 64, 80));
        if (!Preferences.Animations)
            foreach (var page in new[] { ApplicationsPage, InformationPage, SettingsPage, HelpPage }) { page.BeginAnimation(OpacityProperty, null); page.Opacity = 1; }
        UpdateDensity();
    }

    void Dashboard_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (SidebarLayout is null) return;
        double width = ActualWidth;
        bool compact = width < 1500;
        SidebarColumn.Width = new GridLength(Math.Clamp(width * 0.15, 176, 320));
        UpdateInformationPanel();
        DetailsToggle.Visibility = width >= 1150 ? Visibility.Visible : Visibility.Collapsed;
        SidebarLayout.Margin = compact ? new Thickness(14, 24, 14, 18) : new Thickness(24, 30, 24, 24);
        SidebarBrand.FontSize = compact ? 14 : 19;
        CentralContent.Margin = compact ? new Thickness(20, 22, 8, 20) : new Thickness(32, 28, 20, 24);
        RightPanel.Margin = compact ? new Thickness(0, 22, 18, 20) : new Thickness(0, 28, 28, 24);
        WelcomeFontSize = compact ? 27 : 34;
        UpdateDensity();
    }

    void UpdateInformationPanel()
    {
        if (InformationColumn is null || RightPanel is null) return;
        bool visible = ShowInformationPanel && ActualWidth >= 1150;
        InformationColumn.Width = new GridLength(visible ? Math.Clamp(ActualWidth * 0.23, 270, 400) : 0);
        RightPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    }

    void CentralContent_SizeChanged(object sender, SizeChangedEventArgs e) => UpdateDensity();
    void UpdateDensity()
    {
        if (CentralContent is null) return;
        double width = CentralContent.ActualWidth;
        ApplicationColumns = Math.Clamp((int)(width / (Preferences.CompactApplications ? 190 : 250)), 1, 5);
        TileHeight = Preferences.CompactApplications ? 216 : 240;
        TimerFontSize = Preferences.LargeCountdown ? ActualWidth < 1500 ? 54 : 76 : 42;
    }

    void InterfaceSound() { if (Preferences.InterfaceSound) PlaySound(false); }
    static void PlaySound(bool warning)
    {
        try { if (warning) System.Media.SystemSounds.Exclamation.Play(); else System.Media.SystemSounds.Asterisk.Play(); }
        catch (InvalidOperationException) { /* Audio availability never interrupts a gaming session. */ }
    }
    bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value; Changed(name); return true;
    }
    void Changed(string? name) => PropertyChanged?.Invoke(this, new(name));
}
