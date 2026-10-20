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
    readonly bool development = Environment.GetCommandLineArgs().Contains("--development", StringComparer.OrdinalIgnoreCase);
    bool maintenance;

    public MainWindow()
    {
        InitializeComponent();
        using var installed = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\GManagerClient");
        if (development && installed is not null) throw new InvalidOperationException("Development Shell nije dozvoljen na produkcionoj stanici.");
        if (development) { WindowStyle = WindowStyle.SingleBorderWindow; WindowState = WindowState.Normal; ResizeMode = ResizeMode.CanResize; Topmost = false; Width = 900; Height = 780; Title = "G-Manager · Development"; }
        Closing += (_, e) => { if (!development && !maintenance) e.Cancel = true; };
        timer.Tick += async (_, _) => await RefreshStatus();
        timer.Start();
        Loaded += async (_, _) => await RefreshStatus();
        Closed += (_, _) => timer.Stop();
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
            if (response.Success && response.Launches is not null)
                foreach (var launch in response.Launches)
                    Process.Start(new ProcessStartInfo(launch.ExecutablePath, launch.Arguments ?? "") { UseShellExecute = false, WorkingDirectory = System.IO.Path.GetDirectoryName(launch.ExecutablePath)! });
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
        maintenance = value.Mode == ClientMode.Maintenance;
        if (!development) { if (maintenance) Hide(); else if (!IsVisible) Show(); }
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
