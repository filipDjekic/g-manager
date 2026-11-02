using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace GManager.Client.Service;

// Runs as the player through Task Scheduler S4U, without storing a player password.
// This entry point has no IPC, enrollment, configuration or privileged operations.
public static class WindowsEnforcementProbe
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);

    public static int Run(string[] args)
    {
        if (args.Length != 3 || args[0] != "--enforcement-probe" || !Guid.TryParseExact(args[2], "N", out _)) return 10;
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User?.Value != args[1] || identity.IsSystem ||
            identity.Groups?.Contains(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null)) != false) return 11;
        string system = Environment.GetFolderPath(Environment.SpecialFolder.System);
        string probeRoot = Path.Combine(AppContext.BaseDirectory, "enforcement-probe");
        try
        {
            using var positive = Process.Start(new ProcessStartInfo(Path.Combine(system, "whoami.exe"))
                { UseShellExecute = false, CreateNoWindow = true });
            if (positive is null || !positive.WaitForExit(5000) || positive.ExitCode != 0) return 12;
            var module = LoadLibraryEx(Path.Combine(system, "version.dll"), IntPtr.Zero, 0);
            if (module == IntPtr.Zero) return 13;
            FreeLibrary(module);

            foreach (string path in new[] { Path.Combine(probeRoot, args[2] + ".exe"),
                Path.Combine(system, "cmd.exe"), Path.Combine(system, "WindowsPowerShell", "v1.0", "powershell.exe"),
                Path.Combine(system, "wscript.exe"), Path.Combine(system, "cscript.exe"),
                Path.Combine(system, "msiexec.exe"), Path.Combine(system, "rundll32.exe"), Path.Combine(system, "mshta.exe") })
            {
                try
                {
                    using var denied = Process.Start(new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true });
                    if (denied is not null) { denied.Kill(); denied.WaitForExit(5000); }
                    return 14; // A start, regardless of exit code, is a failed enforcement test.
                }
                catch (Win32Exception ex) when (ex.NativeErrorCode == 1260) { }
            }
            module = LoadLibraryEx(Path.Combine(probeRoot, args[2] + ".dll"), IntPtr.Zero, 0);
            int error = Marshal.GetLastPInvokeError();
            if (module != IntPtr.Zero) { FreeLibrary(module); return 15; }
            return error == 1260 ? 0 : 16; // Missing/broken files and other access errors do not prove AppLocker.
        }
        catch { return 17; }
    }
}
