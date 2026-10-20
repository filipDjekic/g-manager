using System.Security.Principal;
using Microsoft.Win32;
using Microsoft.Extensions.Hosting.WindowsServices;

namespace GManager.Client.Service;

public sealed record ClientEnvironment(bool Development, string StateDirectory, string PipeName, string Version, string? PlayerSid)
{
    public static ClientEnvironment Load(string[] args, out IConfiguration settings)
    {
        bool development = args.Contains("--development", StringComparer.OrdinalIgnoreCase);
        using var installed = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\GManagerClient");
        if (development && (installed is not null || WindowsIdentity.GetCurrent().IsSystem))
            throw new InvalidOperationException("Development režim nije dozvoljen na instaliranoj produkcionoj stanici ili kao SYSTEM.");
        if(!development && installed is null && !args.Contains("--enroll-stdin",StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Produkcioni Service zahteva instalaciju. Za ručno pokretanje koristite Development Mode.");
        if(!development && !args.Contains("--enroll-stdin",StringComparer.OrdinalIgnoreCase) && !WindowsServiceHelpers.IsWindowsService())
            throw new InvalidOperationException("Produkcioni Service se pokreće isključivo preko Windows Service Control Manager-a.");
        string directory = development
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GManager", "Development")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "GManager", "Client");
        settings = new ConfigurationBuilder().AddJsonFile(Path.Combine(directory, "client.json"), optional: false, reloadOnChange: false).Build();
        if (settings["Client:Mode"] != (development ? "Development" : "Production"))
            throw new InvalidOperationException("Konfiguracija ne odgovara režimu izvršavanja.");
        var backend = new Uri(settings["Backend:BaseUrl"] ?? "");
        if (!string.IsNullOrEmpty(backend.UserInfo) || backend.Scheme != "https" && !(development && backend.IsLoopback && backend.Scheme == "http"))
            throw new InvalidOperationException("Potreban je HTTPS; lokalni HTTP je dozvoljen samo u development režimu.");
        if (!development && !WindowsIdentity.GetCurrent().IsSystem &&
            !new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
            throw new UnauthorizedAccessException("Produkcioni Service zahteva SYSTEM ili lokalnog administratora.");
        string? player = settings["Client:PlayerSid"];
        if (!development && (string.IsNullOrWhiteSpace(player) || settings["Client:Version"]?.Contains('-') != false))
            throw new InvalidOperationException("Produkcija zahteva standardni Windows nalog i release verziju.");
        return new(development, directory, development ? "GManager.Client.Dev." + WindowsIdentity.GetCurrent().User!.Value : "GManager.Client",
            settings["Client:Version"] ?? "development", player);
    }
}
