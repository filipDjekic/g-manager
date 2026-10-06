using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
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
    IReadOnlyList<ClientApplication> renderedApps = [];
    bool lastActive, refreshing, acting;

    public MainWindow()
    {
        InitializeComponent();
        timer.Tick += async (_, _) => await RefreshStatus();
        timer.Start();
        Loaded += async (_, _) => await RefreshStatus();
        Closed += (_, _) => timer.Stop();
    }

    async Task<LocalResponse> Send(LocalRequest request)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var pipe = new NamedPipeClientStream(".", "GManager.Client", PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(2000, timeout.Token);
        await JsonSerializer.SerializeAsync(pipe, request, cancellationToken: timeout.Token);
        await pipe.FlushAsync(timeout.Token);
        return await JsonSerializer.DeserializeAsync<LocalResponse>(pipe, cancellationToken: timeout.Token)
            ?? throw new InvalidOperationException("Empty service response");
    }

    async Task RefreshStatus()
    {
        if (refreshing || acting) return;
        refreshing = true;
        try
        {
            var response = await Send(new("status", Guid.NewGuid().ToString("N")));
            apps = response.Applications ?? [];
            if (!acting) Render(response.State);
        }
        catch { Connectivity.Text = "Lokalni servis nije dostupan. Ponovno povezivanje je u toku…"; }
        finally { refreshing = false; }
    }

    async Task Act(LocalRequest request, bool render)
    {
        if (acting) return;
        acting = true;
        Login.IsEnabled = Logout.IsEnabled = Applications.IsEnabled = false;
        Error.Text = "";
        try
        {
            var response = await Send(request);
            Error.Text = response.Error ?? "";
            if (render) Render(response.State);
        }
        catch { Error.Text = "Akcija nije potvrđena. Proverite vezu sa G-Manager servisom ili pozovite osoblje."; }
        finally
        {
            acting = false;
            Password.Clear();
            Login.IsEnabled = Logout.IsEnabled = Applications.IsEnabled = true;
        }
    }

    async void Login_Click(object sender, RoutedEventArgs e) =>
        await Act(new("login", Guid.NewGuid().ToString("N"), Email.Text.Trim(), Password.Password), true);

    async void Logout_Click(object sender, RoutedEventArgs e)
    {
        if (sessionId is null) return;
        await Act(new("logout", Guid.NewGuid().ToString("N"), SessionId: sessionId), true);
    }

    async void Launch_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string code)
            await Act(new("launch", Guid.NewGuid().ToString("N"), ApplicationCode: code), false);
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
        sessionId = value.SessionId;
        Heading.Text = value.Heading;
        Connectivity.Text = value.Connectivity;
        var remaining = SafeRemaining(value);
        Countdown.Text = value.EndsAt is null ? "" : $"{Math.Max(0, (int)remaining.TotalHours):00}:{Math.Max(0, remaining.Minutes):00}:{Math.Max(0, remaining.Seconds):00}";
        var active = value.Mode == ClientMode.Active;
        Email.Visibility = Password.Visibility = Login.Visibility = active ? Visibility.Collapsed : Visibility.Visible;
        Logout.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
        if (active == lastActive && apps.SequenceEqual(renderedApps)) return;
        lastActive = active;
        renderedApps = apps.ToArray();
        Applications.Children.Clear();
        if (!active) return;
        foreach (var app in apps)
        {
            var button = new Button { Content = app.Name, Tag = app.Code, MinHeight = 44, Margin = new Thickness(0, 4, 0, 4) };
            button.Click += Launch_Click;
            Applications.Children.Add(button);
        }
    }
}
