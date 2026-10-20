using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using GManager.Client.Domain;
using GManager.Client.Protocol;
using NSec.Cryptography;

namespace GManager.Client.Service;

public sealed class StationPolicyEnforcer(IConfiguration configuration, ProtectedIdentityStore store, ClientEnvironment environment)
{
    static readonly SignatureAlgorithm Signature = SignatureAlgorithm.Ed25519;
    readonly Dictionary<string, PolicyApplication> allowed = new(StringComparer.OrdinalIgnoreCase);
    readonly object sync = new();
    readonly object osSync = new();
    long version;
    bool active;
    bool? appliedActive;
    public long CurrentVersion => version;
    public IReadOnlyList<ClientApplication> VisibleApplications { get { lock(sync) return allowed.Values.Where(x => x.Type is "GAME" or "LAUNCHER").OrderBy(x => x.LaunchOrder).Select(x => new ClientApplication(x.Code,x.Name,x.Type)).ToList(); } }

    public Task ApplyAsync(SignedStationPolicy signed, Guid stationId, CancellationToken ct)
    {
        if(string.IsNullOrEmpty(signed.Payload) || string.IsNullOrEmpty(signed.Signature)) throw new CryptographicException("Signed station policy is required");
        byte[] payload = Decode(signed.Payload);
        if (signed.Algorithm != "Ed25519" || signed.KeyId != configuration["Policy:SigningKeyId"])
            throw new CryptographicException("Station policy signing key is not trusted");
        var key = NSec.Cryptography.PublicKey.Import(Signature, Convert.FromBase64String(configuration["Policy:SigningPublicKey"] ?? ""), KeyBlobFormat.PkixPublicKey);
        if (!Signature.Verify(key, payload, Decode(signed.Signature))) throw new CryptographicException("Station policy signature is invalid");
        var policy = JsonSerializer.Deserialize<StationPolicy>(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidDataException("Invalid station policy");
        if (policy.StationId != stationId || policy.ConfigurationVersion < version) throw new CryptographicException("Station policy scope/version is invalid");
        if (policy.ConfigurationVersion == version) return Task.CompletedTask;
        foreach (var app in policy.Applications) Validate(app);
        lock(osSync)
        {
            PolicyApplication[] previous; lock(sync) previous=allowed.Values.ToArray();
            try
            {
                lock(sync) { allowed.Clear(); foreach (var app in policy.Applications) allowed.Add(app.Code,app); }
                ApplyOsPolicy(ct).GetAwaiter().GetResult();
                store.SavePolicy(signed);
                version=policy.ConfigurationVersion;
            }
            catch
            {
                lock(sync) { allowed.Clear(); foreach(var app in previous) allowed.Add(app.Code,app); }
                appliedActive=null;
                throw;
            }
        }
        return Task.CompletedTask;
    }

    public void SetSessionActive(bool value)
    {
        lock(osSync)
        {
            lock(sync) { if(active == value && appliedActive == value) return; }
            if(value) { PolicyApplication[] applications; lock(sync) applications=allowed.Values.ToArray(); foreach(var app in applications) Validate(app); }
            lock(sync) active=value;
            ApplyOsPolicy(CancellationToken.None).GetAwaiter().GetResult();
        }
    }
    public void ReapplyLocked()
    {
        lock(osSync) { appliedActive=null; SetSessionActive(false); }
    }

    public ClientLaunch Launch(string code)
    {
        lock(sync)
        {
            if (!active || !allowed.TryGetValue(code,out var app) || app.Type == "HELPER") throw new UnauthorizedAccessException("Application is not launchable");
            Validate(app);
            return new(app.ExecutablePath,app.Arguments);
        }
    }
    public IReadOnlyList<ClientLaunch> AutoApplications()
    {
        lock(sync) return allowed.Values.Where(x => x.AutoStart).OrderBy(x => x.LaunchOrder).Select(x => { Validate(x); return new ClientLaunch(x.ExecutablePath,x.Arguments); }).ToList();
    }
    public void StopCustomerProcesses()
    {
        if (environment.Development) return;
        // Includes processes left behind by a previous Service instance; never targets another account.
        string shell = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"..","shell","GManager.Client.Shell.exe"));
        string[] essentials = ["LogonUI.exe","userinit.exe","winlogon.exe","dwm.exe","fontdrvhost.exe","ctfmon.exe","RuntimeBroker.exe","sihost.exe","taskhostw.exe"];
        var essentialPaths=essentials.Select(name=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32",name)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var process in Process.GetProcesses())
        {
            using(process)
            {
                try
                {
                    if (!WindowsProcessOwner.IsPlayer(process, environment.PlayerSid!)) continue;
                    string? executable=process.MainModule?.FileName;
                    if (string.Equals(executable,shell,StringComparison.OrdinalIgnoreCase) || executable is not null && essentialPaths.Contains(executable)) continue;
                    process.Kill();
                    if(!process.WaitForExit(3000)) throw new InvalidOperationException("Customer process could not be stopped");
                }
                catch (ArgumentException) { }
                catch (InvalidOperationException) when(process.HasExited) { }
                catch (System.ComponentModel.Win32Exception ex) { throw new InvalidOperationException("Customer process enforcement failed",ex); }
            }
        }
    }
    Task ApplyOsPolicy(CancellationToken ct)
    {
        if(environment.Development) { appliedActive=active; return Task.CompletedTask; }
        lock(osSync)
        {
        string path = Path.Combine(environment.StateDirectory,"allowed-paths.json");
        string[] paths; lock(sync) paths = active ? allowed.Values.Select(x => x.ExecutablePath).ToArray() : [];
        ProtectedIdentityStore.AtomicWrite(path,JsonSerializer.SerializeToUtf8Bytes(paths));
        var info = new ProcessStartInfo("powershell.exe") { UseShellExecute=false,CreateNoWindow=true };
        foreach(string arg in new[]{"-NoProfile","-NonInteractive","-ExecutionPolicy","AllSigned","-File",Path.Combine(AppContext.BaseDirectory,"apply-policy.ps1"),"-Action","Apply","-StateDirectory",environment.StateDirectory}) info.ArgumentList.Add(arg);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Policy process could not start");
        ct.ThrowIfCancellationRequested();
        if(!process.WaitForExit(45000)) { process.Kill(); appliedActive=null; throw new InvalidOperationException("Windows policy timed out"); }
        if(process.ExitCode != 0) { appliedActive=null; throw new InvalidOperationException("G-Manager Windows politika nije primenjena; koristite administratorski recovery."); }
        appliedActive=active;
        return Task.CompletedTask;
        }
    }
    static void Validate(PolicyApplication app)
    {
        if(!Path.IsPathFullyQualified(app.ExecutablePath) || !app.ExecutablePath.EndsWith(".exe",StringComparison.OrdinalIgnoreCase) || app.ExecutablePath.IndexOfAny(['*','?','"']) >= 0) throw new InvalidDataException("Invalid executable path");
        if(!File.Exists(app.ExecutablePath)) throw new FileNotFoundException("Configured executable is unavailable",app.ExecutablePath);
        if(app.ExecutableSha256 is not null)
        {
            using var stream=File.OpenRead(app.ExecutablePath);
            if(!Convert.ToHexString(SHA256.HashData(stream)).Equals(app.ExecutableSha256,StringComparison.OrdinalIgnoreCase)) throw new CryptographicException("Executable hash mismatch");
        }
        if(app.PublisherCertificateThumbprint is not null || app.Publisher is not null)
        {
#pragma warning disable SYSLIB0057
            using var signer=X509Certificate.CreateFromSignedFile(app.ExecutablePath);
#pragma warning restore SYSLIB0057
            using var certificate=X509CertificateLoader.LoadCertificate(signer.GetRawCertData());
            if(app.PublisherCertificateThumbprint is not null && !certificate.Thumbprint.Equals(app.PublisherCertificateThumbprint,StringComparison.OrdinalIgnoreCase)) throw new CryptographicException("Executable signer mismatch");
            if(app.Publisher is not null && !certificate.Subject.Contains(app.Publisher,StringComparison.OrdinalIgnoreCase)) throw new CryptographicException("Executable publisher mismatch");
            var verify=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","WindowsPowerShell","v1.0","powershell.exe")) { UseShellExecute=false,CreateNoWindow=true };
            verify.ArgumentList.Add("-NoProfile");verify.ArgumentList.Add("-NonInteractive");verify.ArgumentList.Add("-Command");
            verify.ArgumentList.Add("$s=Get-AuthenticodeSignature -LiteralPath $env:GM_VERIFY_PATH; if($s.Status -ne 'Valid'){exit 1}");
            verify.Environment["GM_VERIFY_PATH"]=app.ExecutablePath;
            using var process=Process.Start(verify) ?? throw new CryptographicException("Authenticode verification unavailable");
            if(!process.WaitForExit(15000)) { process.Kill(); throw new CryptographicException("Authenticode verification timed out"); }
            if(process.ExitCode!=0) throw new CryptographicException("Executable Authenticode signature is invalid");
        }
        if(app.ExecutableSha256 is null && app.PublisherCertificateThumbprint is null && app.Publisher is null) throw new CryptographicException("Executable has no trust constraint");
        if(app.MinimumFileVersion is not null && Version.Parse(FileVersionInfo.GetVersionInfo(app.ExecutablePath).FileVersion ?? "0.0") < Version.Parse(app.MinimumFileVersion)) throw new CryptographicException("Executable is too old");
    }
    static byte[] Decode(string value) { var text=value.Replace('-','+').Replace('_','/'); return Convert.FromBase64String(text+new string('=',(4-text.Length%4)%4)); }
}

// Retained for existing policy preview consumers; OS deployment is owned by apply-policy.ps1.
public static class AppLockerXml
{
    public static string Create(StationPolicy policy)
    {
        var rules = policy.Applications.Select(app => new System.Xml.Linq.XElement("FilePathRule",new System.Xml.Linq.XAttribute("Id",Guid.NewGuid()),new System.Xml.Linq.XAttribute("Name",app.Code),new System.Xml.Linq.XAttribute("Description","G-Manager preview"),new System.Xml.Linq.XAttribute("UserOrGroupSid","S-1-5-32-545"),new System.Xml.Linq.XAttribute("Action","Allow"),new System.Xml.Linq.XElement("Conditions",new System.Xml.Linq.XElement("FilePathCondition",new System.Xml.Linq.XAttribute("Path",app.ExecutablePath)))));
        return new System.Xml.Linq.XElement("AppLockerPolicy",new System.Xml.Linq.XAttribute("Version","1"),new System.Xml.Linq.XElement("RuleCollection",new System.Xml.Linq.XAttribute("Type","Exe"),new System.Xml.Linq.XAttribute("EnforcementMode","Enabled"),rules),new System.Xml.Linq.XElement("RuleCollection",new System.Xml.Linq.XAttribute("Type","Script"),new System.Xml.Linq.XAttribute("EnforcementMode","Enabled")),new System.Xml.Linq.XElement("RuleCollection",new System.Xml.Linq.XAttribute("Type","Msi"),new System.Xml.Linq.XAttribute("EnforcementMode","Enabled"))).ToString();
    }
}
