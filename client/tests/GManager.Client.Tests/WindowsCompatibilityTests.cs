using System.Diagnostics;
using GManager.Client.Service;
using Xunit;

namespace GManager.Client.Tests;

public class WindowsCompatibilityTests
{
    [Theory]
    [InlineData(@"C:\Games\game.exe")]
    [InlineData(@"D:\Program Files\Game\game.EXE")]
    public void CanonicalLocalExecutablesAreAccepted(string path) => ApplicationExecutionPolicy.ValidatePath(path);

    [Theory]
    [InlineData(@"\\server\games\game.exe")]
    [InlineData(@"\\?\C:\Games\game.exe")]
    [InlineData(@"C:\Games\..\game.exe")]
    [InlineData(@"C:\Games\game.exe:payload.exe")]
    [InlineData(@"C:\Games\*.exe")]
    [InlineData(@"C:\%TEMP%\game.exe")]
    [InlineData(@"C:\Games.\game.exe")]
    [InlineData(@"C:\Games\\game.exe")]
    [InlineData(@"C:/Games/game.exe")]
    [InlineData(@"game.exe")]
    public void UnsafePathsAreRejected(string path) => Assert.Throws<InvalidDataException>(() => ApplicationExecutionPolicy.ValidatePath(path));

    [Theory]
    [InlineData("cmd.exe")][InlineData("PowerShell.EXE")][InlineData("msiexec.exe")]
    [InlineData("wscript.exe")][InlineData("rundll32.exe")][InlineData("msbuild.exe")]
    [InlineData("dotnet.exe")][InlineData("node.exe")][InlineData("javaw.exe")]
    public void RenamedExecutionHostsCannotBeAuthorized(string original) =>
        Assert.Throws<InvalidDataException>(() => ApplicationExecutionPolicy.ValidateProgram(@"C:\Games\renamed.exe", original));

    [Fact]
    public void ProbeEntryPointDoesNotAcceptArbitraryCommands() => Assert.Equal(10, WindowsEnforcementProbe.Run(["--enforcement-probe", "cmd.exe"]));

    [Fact]
    public void ServiceOutputIncludesBothPolicyModules()
    {
        Assert.True(File.Exists(Path.Combine(AppContext.BaseDirectory, "apply-policy.ps1")));
        Assert.True(File.Exists(Path.Combine(AppContext.BaseDirectory, "windows-enforcement.ps1")));
    }

    [Fact]
    public async Task WindowsPackagingAndEnforcementContracts()
    {
        string directory = AppContext.BaseDirectory;
        while (!File.Exists(Path.Combine(directory, "client", "GManager.Client.slnx")))
            directory = Directory.GetParent(directory)?.FullName ?? throw new InvalidOperationException("Repository root not found");
        var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe"))
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string arg in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
            Path.Combine(directory, "client", "tests", "windows-enforcement.Tests.ps1") }) info.ArgumentList.Add(arg);
        using var process = Process.Start(info)!;
        var stdout = process.StandardOutput.ReadToEndAsync(TestContext.Current.CancellationToken);
        var stderr = process.StandardError.ReadToEndAsync(TestContext.Current.CancellationToken);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(true); throw; }
        Assert.True(process.ExitCode == 0, (await stdout) + (await stderr));
    }
}
