namespace GManager.Client.Service;

public static class ApplicationExecutionPolicy
{
    // These programs execute arbitrary user input or administer Windows. Authorizing
    // one as a game would defeat the player allowlist, even with a valid Microsoft signature.
    static readonly HashSet<string> Hosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "cmd.exe", "powershell.exe", "powershell_ise.exe", "pwsh.exe", "wscript.exe", "cscript.exe",
        "mshta.exe", "rundll32.exe", "regsvr32.exe", "msiexec.exe", "installutil.exe", "msbuild.exe",
        "regasm.exe", "regsvcs.exe", "csc.exe", "vbc.exe", "jsc.exe", "dotnet.exe", "wmic.exe",
        "forfiles.exe", "schtasks.exe", "sc.exe", "reg.exe", "mmc.exe", "control.exe", "explorer.exe",
        "taskmgr.exe", "cmstp.exe", "bitsadmin.exe", "wsl.exe", "bash.exe", "sh.exe", "wslhost.exe",
        "python.exe", "pythonw.exe", "node.exe", "java.exe", "javaw.exe", "csi.exe", "fsi.exe"
    };

    public static void ValidatePath(string path)
    {
        if (path.Length < 4 || !char.IsAsciiLetter(path[0]) || path[1] != ':' || path[2] != '\\' ||
            path.AsSpan(2).IndexOfAny(':', '*', '?') >= 0 || path[2..].Contains(@"\\", StringComparison.Ordinal) || path.IndexOfAny(['"', '%', '/', '\0']) >= 0 ||
            path.Split('\\').Any(part => part is "." or ".." || part.EndsWith(' ') || part.EndsWith('.')) ||
            !path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Executable must use a canonical local .exe path without wildcards, alternate streams or reparse aliases");
    }

    public static void ValidateProgram(string path, string? originalFilename)
    {
        if (Hosts.Contains(Path.GetFileName(path)) || originalFilename is not null && Hosts.Contains(Path.GetFileName(originalFilename)))
            throw new InvalidDataException("Command, script, installer and general-purpose execution hosts cannot be authorized as games or helpers");
    }
}
