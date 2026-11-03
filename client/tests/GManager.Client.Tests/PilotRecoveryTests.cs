using System.Net;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text.Json;
using GManager.Client.Domain;
using GManager.Client.Protocol;
using GManager.Client.Service;
using Microsoft.Extensions.Configuration;
using NSec.Cryptography;
using Xunit;

namespace GManager.Client.Tests;

// Development enforcement only: these exercise the real runtime, signatures and on-disk recovery,
// without changing Windows policy, logging off a player or claiming a physical lock.
public sealed class PilotRecoveryTests
{
    [Theory] [InlineData("id")] [InlineData("version")] [InlineData("deadline")]
    public async Task InvalidSignedUpdateIntentCannotLeaveAnActiveLeaseUsable(string malformed)
    {
        using var f=new Fixture();await f.Login();var now=f.Clock.GetUtcNow();
        var intent=new ClientUpdateDirective(malformed=="id"?Guid.Empty:Guid.NewGuid(),malformed=="version"?"invalid":"4.0.0",now,malformed=="deadline"?now:now.AddDays(1));
        f.Protocol.CurrentLease=f.Protocol.CurrentLease with {ClientUpdate=intent};
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);Assert.Equal("POLICY_FAILED",f.Runtime.ErrorCode);
    }
    [Fact] public async Task LocalUpdatePreparationCannotInterruptAnActivePaidSession()
    {
        using var f=new Fixture();await f.Login();
        var response=await f.Runtime.Handle(new("prepare-update","isolated-update"),true,TestContext.Current.CancellationToken);
        Assert.False(response.Success);Assert.Equal(ClientMode.Active,f.Runtime.State.Mode);
    }
    [Fact] public async Task LostCommandAckIsPersistedAndRetriedAfterServiceRestart()
    {
        using var f=new Fixture(); f.Protocol.FailAck=true;
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(1,f.Store.LoadSnapshot<ClientRecoveryState>()!.PendingCommandAckSequence);
        Assert.Equal(1,f.Protocol.AckAttempts);
        f.Protocol.FailAck=false;
        var restarted=f.CreateRuntime(); await restarted.Recover(TestContext.Current.CancellationToken); await restarted.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(2,f.Protocol.AckAttempts);
        Assert.Null(f.Store.LoadSnapshot<ClientRecoveryState>()!.PendingCommandAckSequence);
        Assert.NotEqual(ClientMode.Active,restarted.State.Mode);
    }

    [Theory] [InlineData("dns")] [InlineData("tls")] [InlineData("timeout")] [InlineData("disconnect")]
    public async Task TransportFailuresRespectOfflineGraceAndNeverResumeAfterDeadline(string failure)
    {
        using var f=new Fixture(); await f.Login(); f.Protocol.Failure=failure;
        await f.Runtime.Refresh(TestContext.Current.CancellationToken); Assert.Equal(ClientMode.Active,f.Runtime.State.Mode);
        f.Clock.Advance(TimeSpan.FromSeconds(61)); f.Runtime.Tick();
        Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        f.Protocol.Failure=null; f.Protocol.CurrentLease=f.Protocol.CurrentLease with {
            IssuedAt=f.Clock.GetUtcNow(),ExpiresAt=f.Clock.GetUtcNow().AddSeconds(30),GraceEndsAt=f.Clock.GetUtcNow().AddSeconds(60) };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        Assert.Equal("SESSION_RECONCILIATION_REQUIRED",f.Runtime.ErrorCode);
    }

    [Fact] public async Task PrunedOrdinaryAckDoesNotBlockANewerLockCommandOrPretendToConfirmPhysicalLock()
    {
        using var f=new Fixture();f.Protocol.FailAck=true;await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        f.Protocol.FailAck=false;f.Protocol.PrunedAck=true;
        f.Protocol.CurrentLease=f.Protocol.CurrentLease with { Directive="LOCK",SessionId=null,SessionEndsAt=null,CommandCursor=2 };
        f.Protocol.Command=f.Protocol.Command with { Sequence=2,Type="FORCE_LOCK" };
        var restarted=f.CreateRuntime();await restarted.Recover(TestContext.Current.CancellationToken);await restarted.Refresh(TestContext.Current.CancellationToken);
        var saved=f.Store.LoadSnapshot<ClientRecoveryState>()!;
        Assert.Equal(2,saved.AppliedSequence);Assert.Null(saved.PendingCommandAckSequence);
        Assert.Equal(2,saved.PendingLockSequence);Assert.Equal(ClientMode.Locked,restarted.State.Mode);
    }

    [Fact] public async Task ExpiredMachineTokenLocksImmediatelyThenAuthenticatesAgain()
    {
        using var f=new Fixture(); await f.Login(); f.Protocol.Failure="unauthorized";
        await f.Runtime.Refresh(TestContext.Current.CancellationToken); Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        f.Protocol.Failure=null; await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(2,f.Protocol.Authentications); Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
    }

    [Fact] public async Task RestoredDatabaseCursorAndReplayedLeaseCannotGrantAccess()
    {
        using var f=new Fixture(); await f.Login();
        f.Protocol.CurrentLease=f.Protocol.CurrentLease with { CommandCursor=0 };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal("SERVER_STATE_ROLLBACK",f.Runtime.ErrorCode); Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        Assert.Equal(1,f.Store.LoadSnapshot<ClientRecoveryState>()!.AppliedSequence);
    }

    [Theory] [InlineData("foreign")] [InlineData("malformed")] [InlineData("version")] [InlineData("unknown")] [InlineData("gap")]
    public async Task InvalidCommandsNeverAdvanceTheDurableCursorOrUnlock(string kind)
    {
        using var f=new Fixture(); var command=f.Protocol.Command;
        f.Protocol.Command=kind switch {
            "foreign"=>command with { Payload=JsonSerializer.Serialize(new { stationId=Guid.NewGuid(),sessionId=f.Session }) },
            "malformed"=>command with { Payload="{" }, "version"=>command with { PayloadVersion=2 },
            "unknown"=>command with { Type="UNLOCK_ALL" }, _=>command with { Sequence=2 } };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(0,f.Store.LoadSnapshot<ClientRecoveryState>()?.AppliedSequence??0);
        Assert.Equal(0,f.Protocol.AckAttempts); Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
    }

    [Fact] public async Task CommandsNewerThanSignedLeaseWaitForTheNextLease()
    {
        using var f=new Fixture(); f.Protocol.CurrentLease=f.Protocol.CurrentLease with { CommandCursor=0 };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken); Assert.Equal(0,f.Protocol.AckAttempts);
        f.Protocol.CurrentLease=f.Protocol.CurrentLease with { CommandCursor=1 };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken); Assert.Equal(1,f.Protocol.AckAttempts);
        Assert.NotEqual(ClientMode.Active,f.Runtime.State.Mode);
    }

    [Fact] public async Task CorruptSnapshotFailsClosedAndPreservesMachineIdentity()
    {
        using var f=new Fixture(); await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        File.WriteAllText(f.Store.SnapshotPath,"{truncated");
        var restarted=f.CreateRuntime(); await restarted.Recover(TestContext.Current.CancellationToken);
        Assert.Equal("RECOVERY_FAILED",restarted.ErrorCode); Assert.Equal(ClientMode.Locked,restarted.State.Mode);
        Assert.Equal(f.Station,f.Store.Load()!.StationId);
    }

    sealed class ManualClock:TimeProvider
    {
        readonly DateTimeOffset start=DateTimeOffset.UtcNow; long ticks;
        public override long TimestampFrequency=>TimeSpan.TicksPerSecond;
        public override long GetTimestamp()=>ticks;
        public override DateTimeOffset GetUtcNow()=>start.AddTicks(ticks);
        public void Advance(TimeSpan value)=>ticks+=value.Ticks;
    }
    sealed class Fixture:IDisposable
    {
        readonly string path=Path.Combine(Path.GetTempPath(),"gmanager-pilot-"+Guid.NewGuid());
        readonly Key key=Key.Create(SignatureAlgorithm.Ed25519,new KeyCreationParameters { ExportPolicy=KeyExportPolicies.AllowPlaintextExport });
        readonly IConfiguration config; readonly ClientEnvironment environment;
        public readonly Guid Station=Guid.NewGuid(),Session=Guid.NewGuid();
        public readonly ManualClock Clock=new(); public readonly ProtectedIdentityStore Store;
        public readonly FakeProtocol Protocol; public readonly ClientRuntime Runtime;
        public Fixture()
        {
            Directory.CreateDirectory(path); environment=new(true,path,"pilot-test","pilot-test",null);
            config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
                ["Policy:SigningKeyId"]="pilot",["Policy:SigningPublicKey"]=Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey)) }).Build();
            Store=new(environment); using var signer=new Ed25519Signer(); Store.Save(new(Guid.NewGuid(),Station,1,signer.Export()));
            Protocol=new(this); Runtime=CreateRuntime();
        }
        public ClientRuntime CreateRuntime()=>new(Store,Protocol,new(config,Store,environment),new(config),new(environment),environment,Clock);
        public async Task Login() { await Runtime.Refresh(TestContext.Current.CancellationToken); var response=await Runtime.Handle(new("guest-login","pilot",SessionId:Session),false,TestContext.Current.CancellationToken); Assert.True(response.Success); Assert.Equal(ClientMode.Active,Runtime.State.Mode); }
        public string Signed<T>(T value)=>Url(JsonSerializer.SerializeToUtf8Bytes(value,new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        public string Signature(string payload)=>Url(SignatureAlgorithm.Ed25519.Sign(key,Convert.FromBase64String(payload.Replace('-','+').Replace('_','/')+new string('=',(4-payload.Length%4)%4))));
        static string Url(byte[] bytes)=>Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_');
        public void Dispose() { key.Dispose(); Directory.Delete(path,true); }
    }
    sealed class FakeProtocol:IMachineProtocolClient
    {
        public Task ClaimUpdateAsync(string bearer,Guid? requestId,CancellationToken ct)=>Task.CompletedTask;
        readonly Fixture f; public SessionLease CurrentLease; public MachineCommand Command;
        public string? Failure; public bool FailAck,PrunedAck; public int AckAttempts,Authentications;
        public FakeProtocol(Fixture fixture) { f=fixture; var now=f.Clock.GetUtcNow();
            CurrentLease=new(Guid.NewGuid(),f.Station,f.Session,null,now.AddMinutes(10),1,now,now.AddSeconds(30),now.AddSeconds(60),1,"ACTIVE");
            Command=new(1,"SESSION_STARTED",1,JsonSerializer.Serialize(new {stationId=f.Station,sessionId=f.Session}),now); }
        public Task<MachineToken> AuthenticateAsync(Guid id,IChallengeSigner signer,CancellationToken ct) { Authentications++; return Task.FromResult(new MachineToken("test-token",DateTimeOffset.UtcNow.AddHours(1),"Bearer")); }
        public Task<SignedStationPolicy> ConfigurationAsync(string bearer,CancellationToken ct) { var p=f.Signed(new StationPolicy(f.Station,Guid.NewGuid(),1,f.Clock.GetUtcNow(),[]));return Task.FromResult(new SignedStationPolicy(p,"Ed25519","pilot",f.Signature(p))); }
        public Task<SignedSessionLease> LeaseAsync(string bearer,CancellationToken ct) {
            if(Failure is not null) throw Failure switch { "dns"=>new HttpRequestException("DNS unavailable",new SocketException((int)SocketError.HostNotFound)),
                "tls"=>new HttpRequestException("TLS rejected",new AuthenticationException()),"timeout"=>new TaskCanceledException(),
                "unauthorized"=>new HttpRequestException("expired",null,HttpStatusCode.Unauthorized),_=>new HttpRequestException("connection lost") };
            var p=f.Signed(CurrentLease);return Task.FromResult(new SignedSessionLease(p,"Ed25519","pilot",f.Signature(p))); }
        public Task<IReadOnlyList<MachineCommand>> CommandsAsync(string bearer,long after,CancellationToken ct)=>Task.FromResult<IReadOnlyList<MachineCommand>>(Command.Sequence>after?[Command]:[]);
        public Task AckAsync(string bearer,long sequence,CancellationToken ct) { AckAttempts++;if(FailAck)throw new HttpRequestException("ACK response lost");if(PrunedAck&&sequence==1)throw new HttpRequestException("Retired command",null,HttpStatusCode.NotFound);return Task.CompletedTask; }
        public Task HeartbeatAsync(string bearer,Heartbeat value,CancellationToken ct)=>Task.CompletedTask;
        public Task<CustomerSession> GuestLoginAsync(string bearer,Guid session,CancellationToken ct)=>Task.FromResult(new CustomerSession(f.Session,f.Station,null,"Pilot Guest",f.Clock.GetUtcNow(),CurrentLease.SessionEndsAt!.Value,f.Clock.GetUtcNow()));
        public Task LockAckAsync(string b,Guid s,long q,Guid? l,string r,CancellationToken ct)=>throw new InvalidOperationException("Physical ACK must never be sent by development enforcement");
        public Task<EnrollmentResult> EnrollAsync(string t,IChallengeSigner s,string v,CancellationToken ct)=>throw new NotSupportedException();
        public Task<SessionSnapshot> SnapshotAsync(string b,CancellationToken ct)=>throw new NotSupportedException();
        public Task<CustomerSession> LoginAsync(string b,string e,string p,CancellationToken ct)=>throw new NotSupportedException();
        public Task LogoutAsync(string b,Guid s,CancellationToken ct)=>Task.CompletedTask;
    }
}
