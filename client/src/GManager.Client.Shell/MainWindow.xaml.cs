using System.IO;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using System.Text;
using System.Security.Principal;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using GManager.Client.Domain;

namespace GManager.Client.Shell;

public partial class MainWindow : Window
{
    readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(1) };
    readonly Stopwatch countdownClock = new();
    Guid? sessionId;
    DateTimeOffset? trackedEnd;
    TimeSpan countdownBaseline;
    IReadOnlyList<ClientApplication> apps = [];
    bool refreshing, acting, sessionExpired;
    long actionVersion;
    readonly bool development = Environment.GetCommandLineArgs().Contains("--development", StringComparer.OrdinalIgnoreCase);
    bool maintenance;
    ClientViewState currentState = ClientViewState.Locked();
    ClientMode? displayedMode;
    Guid? displayedSessionId;
    bool serviceAvailable, serviceUnavailable, loggingIn, syncingPassword;

    public MainWindow()
    {
        InitializeComponent();
        using var installed = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\GManagerClient");
        if (development && installed is not null) throw new InvalidOperationException("Development Shell nije dozvoljen na produkcionoj stanici.");
        if (development) { WindowStyle = WindowStyle.SingleBorderWindow; WindowState = WindowState.Normal; ResizeMode = ResizeMode.CanResize; Topmost = false; Width = 900; Height = 780; Title = "G-Manager · Development"; }
        Closing += (_, e) => { if (!development && !maintenance) e.Cancel = true; };
        ClientVersion.Text = "v" + (typeof(MainWindow).Assembly.GetName().Version?.ToString(3) ?? "1.0.0");
        Deactivated += (_, _) => MaskPassword();
        Dashboard.LaunchRequested += Dashboard_LaunchRequested;
        Dashboard.LogoutRequested += Dashboard_LogoutRequested;
        RenderView();
        timer.Tick += async (_, _) => { UpdateSessionClock(); await RefreshStatus(); };
        timer.Start();
        Loaded += async (_, _) => await RefreshStatus();
        Closed += (_, _) => { timer.Stop(); Dashboard.EndSession(); ClearCredentials(); };
    }

    async Task<LocalResponse> Send(LocalRequest request)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        string name = development ? "GManager.Client.Dev." + WindowsIdentity.GetCurrent().User!.Value : "GManager.Client";
        await using var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        await pipe.ConnectAsync(2000, timeout.Token);
        if (!development) VerifyService(pipe);
        using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
        await writer.WriteLineAsync(JsonSerializer.Serialize(request).AsMemory(), timeout.Token);
        string line = await reader.ReadLineAsync(timeout.Token) ?? throw new InvalidOperationException("Empty service response");
        return JsonSerializer.Deserialize<LocalResponse>(line)
            ?? throw new InvalidOperationException("Empty service response");
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder path, ref uint size);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenSCManager(string? machine, string? database, uint access);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenService(IntPtr manager, string name, uint access);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool QueryServiceStatusEx(IntPtr service, int level, out ServiceStatus status, int size, out int needed);
    [DllImport("advapi32.dll")] static extern bool CloseServiceHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] struct ServiceStatus { public uint ServiceType, State, Controls, Win32Exit, ServiceExit, CheckPoint, WaitHint, ProcessId, Flags; }
    static void VerifyService(NamedPipeClientStream pipe)
    {
        if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out uint pid)) throw new UnauthorizedAccessException("Service peer unavailable");
        var manager=OpenSCManager(null,null,1);
        if(manager==IntPtr.Zero) throw new UnauthorizedAccessException("Service manager unavailable");
        try {
            var service=OpenService(manager,"GManagerClient",4);
            if(service==IntPtr.Zero) throw new UnauthorizedAccessException("Installed Service unavailable");
            try { if(!QueryServiceStatusEx(service,0,out var status,Marshal.SizeOf<ServiceStatus>(),out _) || status.ProcessId!=pid || status.State!=4) throw new UnauthorizedAccessException("Untrusted pipe server"); }
            finally { CloseServiceHandle(service); }
        } finally { CloseServiceHandle(manager); }
        using var process = OpenProcess(0x1000, false, (int)pid);
        var path = new StringBuilder(32768); uint length = (uint)path.Capacity;
        if (process.IsInvalid || !QueryFullProcessImageName(process, 0, path, ref length) ||
            !path.ToString().Equals(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "GManager Client", "service", "GManager.Client.Service.exe"), StringComparison.OrdinalIgnoreCase)) throw new UnauthorizedAccessException("Untrusted Service peer");
    }

    async Task RefreshStatus()
    {
        if (refreshing || acting) return;
        refreshing = true;
        long version = actionVersion;
        try
        {
            var response = await Send(new("status", Guid.NewGuid().ToString("N")));
            if (!acting && version == actionVersion)
            {
                apps = response.Applications ?? [];
                Render(response.State);
            }
        }
        catch { if (!acting && version == actionVersion) ServiceUnavailable(); }
        finally { refreshing = false; }
    }

    async Task Act(LocalRequest request)
    {
        if (acting) return;
        acting = true;
        actionVersion++;
        loggingIn = request.Type == "login";
        MaskPassword();
        UpdateControls();
        Error.Text = "";
        bool serviceResponded = false;
        try
        {
            var response = await Send(request);
            serviceResponded = true;
            if (request.Type == "login" && response.Success && response.State.Mode == ClientMode.Active && request.Email is not null)
                Dashboard.PrepareAccount(request.Email);
            if(request.Type=="guest-login" && response.Success && response.State.Mode==ClientMode.Active)
                Dashboard.PrepareGuest(response.State.SessionId!.Value);
            apps = response.Applications ?? apps;
            Render(response.State);
            Error.Text = response.Error ?? "";
            if (!response.Success && response.Error is not null) Dashboard.Notify(response.Error, true);
            if (response.Success && response.Launches is not null)
                foreach (var launch in response.Launches)
                    Process.Start(new ProcessStartInfo(launch.ExecutablePath, launch.Arguments ?? "") { UseShellExecute = false, WorkingDirectory = System.IO.Path.GetDirectoryName(launch.ExecutablePath)! });
        }
        catch
        {
            if (!serviceResponded) ServiceUnavailable();
            Error.Text = serviceResponded
                ? "Aplikaciju nije moguće pokrenuti. Za pomoć se obratite osoblju."
                : "Akcija nije potvrđena. Proverite vezu sa G-Manager servisom ili pozovite osoblje.";
            Dashboard.Notify(Error.Text, true);
        }
        finally
        {
            acting = false;
            loggingIn = false;
            MaskPassword();
            Password.Clear();
            UpdateControls();
        }
    }

    async void GuestLogin_Click(object sender,RoutedEventArgs e)
    {
        if(currentState.GuestSession && currentState.Mode==ClientMode.Login && sessionId is Guid id)
            await Act(new("guest-login",Guid.NewGuid().ToString("N"),SessionId:id));
    }

    async void Login_Click(object sender, RoutedEventArgs e)
    {
        if (!Login.IsEnabled || currentState.Mode != ClientMode.Login || !serviceAvailable) return;
        await Act(new("login", Guid.NewGuid().ToString("N"), Email.Text.Trim(), Password.Password));
    }

    async void Dashboard_LogoutRequested()
    {
        if (sessionId is null || acting || !serviceAvailable || sessionExpired || currentState.Mode != ClientMode.Active) return;
        await Act(new("logout", Guid.NewGuid().ToString("N"), SessionId: sessionId));
    }

    async void Dashboard_LaunchRequested(string code)
    {
        if (acting || !serviceAvailable || sessionExpired || sessionId is null || currentState.Mode != ClientMode.Active || !apps.Any(x => x.Code == code)) return;
        await Act(new("launch", Guid.NewGuid().ToString("N"), ApplicationCode: code));
    }

    TimeSpan SafeRemaining(ClientViewState value)
    {
        var computed = value.Remaining(DateTimeOffset.UtcNow);
        if (value.EndsAt != trackedEnd) { trackedEnd = value.EndsAt; countdownBaseline = computed; countdownClock.Restart(); }
        var monotonic = countdownBaseline - countdownClock.Elapsed;
        if (computed < monotonic) { countdownBaseline = computed; countdownClock.Restart(); return computed; }
        return monotonic;
    }

    void Render(ClientViewState value)
    {
        bool changed = currentState != value || !serviceAvailable;
        currentState = value;
        serviceAvailable = true;
        serviceUnavailable = false;
        maintenance = value.Mode == ClientMode.Maintenance;
        if (!development) { if (maintenance) Hide(); else if (!IsVisible) Show(); }
        sessionId = value.SessionId;
        Dashboard.NotifyMode(value.Mode);
        if (value.Mode == ClientMode.Active)
            Dashboard.UpdateSession(value, apps, SafeRemaining(value), serviceAvailable, acting);
        else if (value.Mode == ClientMode.Offline) Dashboard.UpdateConnection(value, true);
        else if (value.Mode != ClientMode.Offline && Dashboard.HasSession) Dashboard.EndSession();
        UpdateSessionClock();
        if (changed) RenderView();
    }

    void UpdateSessionClock()
    {
        Dashboard.UpdateLocalClock(DateTimeOffset.Now);
        var remaining = SafeRemaining(currentState);
        bool expired = currentState.Mode == ClientMode.Active && currentState.EndsAt is not null && remaining <= TimeSpan.Zero;
        if (currentState.Mode == ClientMode.Active) Dashboard.UpdateCountdown(remaining, currentState.EndsAt is not null);
        if (expired == sessionExpired) return;
        sessionExpired = expired;
        RenderView();
    }

    void ServiceUnavailable()
    {
        serviceAvailable = false;
        serviceUnavailable = true;
        Dashboard.UpdateConnection(currentState, false);
        Dashboard.CloseLogout();
        RenderView();
    }

    void RenderView()
    {
        var mode = serviceUnavailable ? ClientMode.Offline : sessionExpired || currentState.Mode == ClientMode.Active && sessionId is null
            ? ClientMode.Locked : currentState.Mode;
        if (displayedMode != mode || displayedSessionId != currentState.SessionId)
        {
            ClearCredentials();
            Error.Text = "";
            PanelScroll.ScrollToTop();
            displayedMode = mode;
            displayedSessionId = currentState.SessionId;
        }

        bool login = mode == ClientMode.Login;
        bool active = mode == ClientMode.Active;
        Dashboard.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
        if (!active) Dashboard.CloseLogout();
        LayoutRoot.Visibility = active ? Visibility.Collapsed : Visibility.Visible;
        LoginForm.Visibility = login && !currentState.GuestSession ? Visibility.Visible : Visibility.Collapsed;
        GuestLogin.Visibility = login && currentState.GuestSession ? Visibility.Visible : Visibility.Collapsed;
        StationNotice.Visibility = login || active ? Visibility.Collapsed : Visibility.Visible;
        HelpText.Visibility = active ? Visibility.Collapsed : Visibility.Visible;

        // A successful local pipe request alone does not establish backend connectivity.
        bool online = serviceAvailable && mode != ClientMode.Offline && currentState.ServerConnected == true;
        bool disconnected = mode == ClientMode.Offline || currentState.ServerConnected == false;
        ConnectionDot.Fill = (Brush)FindResource(disconnected ? "Danger" : online ? "Connected" : "Primary");
        Connectivity.Text = serviceUnavailable
            ? "Lokalni servis nije dostupan. Ponovno povezivanje je u toku…"
            : disconnected ? "Server nije dostupan"
            : currentState.ServerConnected is null && currentState.Connectivity.Equals("Online", StringComparison.OrdinalIgnoreCase)
                ? "Servis je dostupan. Provera veze sa serverom…"
            : online ? "Server je povezan" : currentState.Connectivity;
        Connectivity.Foreground = (Brush)FindResource(disconnected ? "Danger" : "MutedText");

        Heading.Text = mode switch
        {
            ClientMode.Login => currentState.GuestSession ? "Gost sesija" : "Prijavi se",
            ClientMode.Active => string.IsNullOrWhiteSpace(currentState.CustomerName) ? "Tvoja sesija" : $"Zdravo, {currentState.CustomerName}",
            ClientMode.Offline => "Veza je prekinuta",
            ClientMode.Maintenance => "Održavanje stanice",
            _ => sessionExpired ? "Sesija je istekla" : "Stanica je zaključana"
        };
        PanelEyebrow.Text = mode switch
        {
            ClientMode.Active => "AKTIVNA SESIJA",
            ClientMode.Locked => "ČEKA AKTIVACIJU",
            ClientMode.Offline => "PROVERA KONEKCIJE",
            ClientMode.Maintenance => "G-MANAGER PODRŠKA",
            _ => "PRIJAVA NA STANICU"
        };
        Subtitle.Text = mode switch
        {
            ClientMode.Login => "Pristupi svojoj gaming sesiji.",
            ClientMode.Active => "Uživaj u svom gaming prostoru.",
            ClientMode.Offline => "Sačekaj da se veza ponovo uspostavi.",
            ClientMode.Maintenance => "Stanica je privremeno van upotrebe.",
            _ => "Za početak je potrebna aktivna sesija."
        };
        StateIcon.Data = (Geometry)FindResource(mode switch
        {
            ClientMode.Offline => "OfflineGeometry",
            ClientMode.Maintenance => "MaintenanceGeometry",
            _ => "LockGeometry"
        });
        StateIcon.Stroke = (Brush)FindResource(mode == ClientMode.Offline ? "Danger" : "Primary");
        StateTitle.Text = mode switch
        {
            ClientMode.Offline => "Povezivanje je u toku…",
            ClientMode.Maintenance => "Pripremamo stanicu za igru.",
            _ => sessionExpired ? "Vreme je isteklo." : "Obrati se osoblju za početak."
        };
        StateDescription.Text = mode switch
        {
            ClientMode.Offline => "Pristup stanici trenutno nije dostupan. Ako se veza uskoro ne vrati, obrati se osoblju.",
            ClientMode.Maintenance => "Osoblje obavlja održavanje računara. Pristup će biti dostupan po završetku održavanja.",
            _ => sessionExpired ? "Za novu gaming sesiju obrati se osoblju. Stanicom i aplikacijama i dalje upravlja Client Service."
                : "Za aktivaciju ove stanice obrati se osoblju. Ekran za prijavu pojaviće se kada sesija bude spremna."
        };
        UpdateControls();
    }

    void UpdateControls()
    {
        bool available = serviceAvailable && !acting && !sessionExpired;
        bool login = available && currentState.Mode == ClientMode.Login && currentState.SessionId is not null;
        Email.IsEnabled = Password.IsEnabled = RevealedPassword.IsEnabled = RevealPassword.IsEnabled = Login.IsEnabled = login;
        GuestLogin.IsEnabled=login && currentState.GuestSession;
        Dashboard.SetBusy(acting, serviceAvailable && !sessionExpired && sessionId is not null && currentState.Mode == ClientMode.Active);
        LoginLabel.Text = loggingIn ? "PRIJAVA U TOKU…" : "PRIJAVI SE";
        LoginArrow.Visibility = loggingIn ? Visibility.Collapsed : Visibility.Visible;
    }

    void Password_Changed(object sender, RoutedEventArgs e)
    {
        using var secret = Password.SecurePassword;
        Password.Tag = secret.Length == 0 ? "Empty" : "Filled";
        if (syncingPassword || RevealPassword.IsChecked != true) return;
        syncingPassword = true;
        try { RevealedPassword.Text = Password.Password; }
        finally { syncingPassword = false; }
    }

    void RevealedPassword_Changed(object sender, TextChangedEventArgs e)
    {
        if (syncingPassword || RevealPassword.IsChecked != true) return;
        syncingPassword = true;
        try { Password.Password = RevealedPassword.Text; }
        finally { syncingPassword = false; }
    }

    void RevealPassword_Click(object sender, RoutedEventArgs e)
    {
        if (RevealPassword.IsChecked == true)
        {
            RevealedPassword.Text = Password.Password;
            RevealedPassword.Visibility = Visibility.Visible;
            Password.Visibility = Visibility.Collapsed;
            RevealPassword.ToolTip = "Sakrij lozinku";
            System.Windows.Automation.AutomationProperties.SetName(RevealPassword, "Sakrij lozinku");
            RevealedPassword.Focus();
            RevealedPassword.CaretIndex = RevealedPassword.Text.Length;
        }
        else
        {
            MaskPassword();
            Password.Focus();
        }
    }

    void MaskPassword()
    {
        syncingPassword = true;
        try
        {
            RevealPassword.IsChecked = false;
            RevealedPassword.Clear();
            RevealedPassword.Visibility = Visibility.Collapsed;
            Password.Visibility = Visibility.Visible;
            RevealPassword.ToolTip = "Prikaži lozinku";
            System.Windows.Automation.AutomationProperties.SetName(RevealPassword, "Prikaži lozinku");
        }
        finally { syncingPassword = false; }
    }

    void ClearCredentials()
    {
        MaskPassword();
        Password.Clear();
        Email.Clear();
    }

    void LayoutRoot_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (SessionCard is null) return;
        double width = LayoutRoot.ActualWidth, height = LayoutRoot.ActualHeight;
        bool compact = width < 1500 || height < 850;
        bool narrow = width < 1100;
        BrandColumn.Width = narrow ? new GridLength(0) : new GridLength(3, GridUnitType.Star);
        Branding.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        PanelColumn.Width = new GridLength(narrow ? 1 : 2, GridUnitType.Star);
        BrandContent.Margin = compact ? new Thickness(40, 34, 24, 30) : new Thickness(72, 60, 48, 46);
        PanelHost.Margin = compact ? new Thickness(16, 24, 32, 24) : new Thickness(28, 42, 64, 42);
        SessionCard.Padding = new Thickness(compact ? 28 : 40);
        Slogan.FontSize = compact ? 48 : width >= 2300 ? 84 : 72;
        Tagline.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        Slogan.LineHeight = Slogan.FontSize * 1.09;
        Tagline.FontSize = compact ? 16 : 19;
        Heading.FontSize = compact ? 32 : 38;
        Heading.LineHeight = compact ? 38 : 44;
        FormDivider.Margin = new Thickness(0, compact ? 22 : 28, 0, compact ? 22 : 28);
        // Constrain the card, so long names, errors and application lists scroll at high DPI.
        PanelHost.MaxHeight = Math.Max(120, height - PanelHost.Margin.Top - PanelHost.Margin.Bottom);
    }
}
