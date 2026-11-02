using GManager.Client.Protocol;
using GManager.Client.Service;

if (args.FirstOrDefault() == "--enforcement-probe")
{
    Environment.ExitCode = WindowsEnforcementProbe.Run(args);
    return;
}

var environment = ClientEnvironment.Load(args, out var settings);
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
