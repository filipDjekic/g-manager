using GManager.Client.Protocol;
using GManager.Client.Service;

if (args.FirstOrDefault() == "--enforcement-probe")
{
    Environment.ExitCode = WindowsEnforcementProbe.Run(args);
    return;
}

// This helper must run before configuration, identity loading and Windows Service checks.
if (args.Contains("--development-public-key", StringComparer.OrdinalIgnoreCase))
{
    if (args.Length != 3 || args[0] != "--development" || args[1] != "--development-public-key")
    {
        Console.Error.WriteLine("SIGNING_KEY_ARGUMENTS: Expected --development --development-public-key <file>.");
        Environment.ExitCode = 2;
        return;
    }
    byte[]? encoded = null;
    byte[]? seed = null;
    try
    {
        encoded = Convert.FromBase64String(File.ReadAllText(args[2]).Trim());
        // Backend uses RFC 8410 Ed25519 PKCS#8, whereas NSec imports a raw 32-byte seed.
        var document = new System.Formats.Asn1.AsnReader(encoded, System.Formats.Asn1.AsnEncodingRules.DER);
        var sequence = document.ReadSequence();
        if (sequence.ReadInteger() != 0) throw new System.Security.Cryptography.CryptographicException();
        var algorithm = sequence.ReadSequence();
        if (algorithm.ReadObjectIdentifier() != "1.3.101.112") throw new System.Security.Cryptography.CryptographicException();
        algorithm.ThrowIfNotEmpty();
        byte[] privateOctets = sequence.ReadOctetString();
        try
        {
            var nested = new System.Formats.Asn1.AsnReader(privateOctets, System.Formats.Asn1.AsnEncodingRules.DER);
            seed = nested.ReadOctetString();
            nested.ThrowIfNotEmpty();
        }
        finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(privateOctets); }
        sequence.ThrowIfNotEmpty();
        document.ThrowIfNotEmpty();
        if (seed.Length != 32) throw new System.Security.Cryptography.CryptographicException();
        using var key = NSec.Cryptography.Key.Import(NSec.Cryptography.SignatureAlgorithm.Ed25519, seed, NSec.Cryptography.KeyBlobFormat.RawPrivateKey);
        Console.WriteLine(Convert.ToBase64String(key.PublicKey.Export(NSec.Cryptography.KeyBlobFormat.PkixPublicKey)));
    }
    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
    {
        Console.Error.WriteLine("SIGNING_KEY_READ_FAILED: Cannot read the local backend signing key file.");
        Environment.ExitCode = 3;
    }
    catch (Exception ex) when (ex is FormatException or System.Formats.Asn1.AsnContentException or System.Security.Cryptography.CryptographicException or ArgumentException)
    {
        // Do not include exception contents: the input contains private key material.
        Console.Error.WriteLine("SIGNING_KEY_FORMAT_INVALID: Expected Base64 RFC 8410 Ed25519 PKCS#8 with a 32-byte seed.");
        Environment.ExitCode = 4;
    }
    finally
    {
        if (seed is not null) System.Security.Cryptography.CryptographicOperations.ZeroMemory(seed);
        if (encoded is not null) System.Security.Cryptography.CryptographicOperations.ZeroMemory(encoded);
    }
    return;
}
var environment = ClientEnvironment.Load(args, out var settings);
using var developmentInstance = environment.Development ? new FileStream(Path.Combine(environment.StateDirectory,"service.instance"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None) : null;
bool enroll = args.Contains("--enroll-stdin", StringComparer.OrdinalIgnoreCase);
var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { Args = [], ContentRootPath = AppContext.BaseDirectory });
// Installed protection is configured exclusively by the ACL-protected file.
builder.Configuration.Sources.Clear();
builder.Configuration.AddConfiguration(settings);
builder.Services.AddSingleton(environment);
builder.Services.AddWindowsService(options => options.ServiceName = "GManagerClient");
builder.Services.AddSingleton<ProtectedIdentityStore>();
builder.Services.AddSingleton<StationPolicyEnforcer>();
builder.Services.AddSingleton<SessionLeaseVerifier>();
builder.Services.AddSingleton<OperationalEventWriter>();
builder.Services.AddSingleton<ClientRuntime>();
builder.Services.AddHttpClient<IMachineProtocolClient, MachineProtocolClient>(http => {
    http.BaseAddress = new Uri(settings["Backend:BaseUrl"]!);
    http.Timeout = TimeSpan.FromSeconds(5);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect=false });
if (!enroll) builder.Services.AddHostedService<ClientWorker>();
using var host = builder.Build();
if (enroll)
{
    var store = host.Services.GetRequiredService<ProtectedIdentityStore>();
    if (store.Load() is not null) return;
    string token = Console.ReadLine() ?? throw new InvalidOperationException("Enrollment token je obavezan na stdin.");
    using var signer = new Ed25519Signer();
    var result = await host.Services.GetRequiredService<IMachineProtocolClient>().EnrollAsync(token, signer, environment.Version, CancellationToken.None);
    store.Save(new(result.IdentityId, result.StationId, result.KeyVersion, signer.Export()));
    return;
}
await host.RunAsync();
