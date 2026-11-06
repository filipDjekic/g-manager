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
    public async Task TransportFailuresRespectTimeDeadlineAndRequireNewAssignment(string failure)
    {
        using var f=new Fixture(); await f.Login(); f.Protocol.Failure=failure;
        await f.Runtime.Refresh(TestContext.Current.CancellationToken); Assert.Equal(ClientMode.Active,f.Runtime.State.Mode);
        f.Clock.Advance(TimeSpan.FromSeconds(31)); f.Runtime.Tick();
        Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        f.Protocol.Failure=null; f.Protocol.CurrentLease=f.Protocol.CurrentLease with {
            IssuedAt=f.Clock.GetUtcNow(),ExpiresAt=f.Clock.GetUtcNow().AddSeconds(30),GraceEndsAt=f.Clock.GetUtcNow().AddSeconds(30) };
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        Assert.Null(f.Runtime.ErrorCode);Assert.Equal(1,f.Protocol.RecoveryCalls);
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

    [Fact] public async Task OfflineLogoutLocksLocallyAndCannotResumeTheOldSession() {
        using var f=new Fixture();Waiting(f);f.Protocol.ActivateTimeOnLogin=true;
        await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        var login=await f.Runtime.Handle(new("login","start","customer@test","password"),false,TestContext.Current.CancellationToken);
        Assert.True(login.Success);Assert.Equal(GamingClientState.ACTIVE,f.Runtime.State.SessionState);
        f.Protocol.FailLogout=true;
        var finish=await f.Runtime.Handle(new("logout","finish",SessionId:f.Session),false,TestContext.Current.CancellationToken);
        Assert.False(finish.Success);Assert.Equal(ClientMode.Locked,f.Runtime.State.Mode);
        Assert.True(f.Store.LoadSnapshot<ClientRecoveryState>()!.LocallyLocked);
        Assert.Equal(f.Session,f.Store.LoadSnapshot<ClientRecoveryState>()!.BlockedSessionId);
        f.Protocol.FailLogout=false;await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(1,f.Protocol.RecoveryCalls);Assert.Equal(GamingClientState.LOCKED_FREE,f.Runtime.State.SessionState);
        Assert.Null(f.Protocol.CurrentLease.SessionId);
    }

    static void Waiting(Fixture f) {
        var now=f.Clock.GetUtcNow();f.Protocol.CurrentLease=f.Protocol.CurrentLease with { Directive="LOCK",SessionId=null,CustomerId=null,SessionEndsAt=null,CommandCursor=0,AssignmentId=Guid.NewGuid(),AssignmentExpiresAt=now.AddMinutes(5),ExpiresAt=now.AddSeconds(30),GraceEndsAt=now.AddSeconds(30) };
        f.Protocol.Command=f.Protocol.Command with { Sequence=0 };
    }
    [Fact] public async Task WaitingAssignmentShowsLoginWithoutAnActiveTimerOrUnlock() {
        using var f=new Fixture();Waiting(f);await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(ClientMode.Login,f.Runtime.State.Mode);Assert.Equal(GamingClientState.ASSIGNED,f.Runtime.State.SessionState);Assert.Null(f.Runtime.State.EndsAt);
        f.Clock.Advance(TimeSpan.FromSeconds(5));f.Runtime.Tick();Assert.Equal(ClientMode.Login,f.Runtime.State.Mode);
        Assert.True(f.Store.LoadSnapshot<ClientRecoveryState>()!.LocallyLocked);
    }
    [Fact] public async Task PasswordSuccessWithoutSignedActivationCannotUnlock() {
        using var f=new Fixture();Waiting(f);await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        var result=await f.Runtime.Handle(new("login","password-only","customer@test","password"),false,TestContext.Current.CancellationToken);
        Assert.False(result.Success);Assert.NotEqual(ClientMode.Active,f.Runtime.State.Mode);
    }
    [Fact] public async Task LoginRequiresTheNewSignedSessionAndRetainsItsDeadlineAfterRestart() {
        using var f=new Fixture();Waiting(f);f.Protocol.ActivateTimeOnLogin=true;await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        var result=await f.Runtime.Handle(new("login","activate-time","customer@test","password"),false,TestContext.Current.CancellationToken);
        Assert.True(result.Success);Assert.Equal(ClientMode.Active,result.State.Mode);Assert.Equal(4500,result.State.BalanceSeconds);
        var restarted=f.CreateRuntime();await restarted.Recover(TestContext.Current.CancellationToken);Assert.NotEqual(ClientMode.Active,restarted.State.Mode);
        f.Clock.Advance(TimeSpan.FromSeconds(31));restarted.Tick();Assert.Equal(ClientMode.Locked,restarted.State.Mode);
    }
    [Fact] public async Task RestartedServiceSettlesOldTimeInsteadOfRenewingItWhileLocked() {
        using var f=new Fixture();Waiting(f);f.Protocol.ActivateTimeOnLogin=true;await f.Runtime.Refresh(TestContext.Current.CancellationToken);
        Assert.True((await f.Runtime.Handle(new("login","before-restart","customer@test","password"),false,TestContext.Current.CancellationToken)).Success);
        f.Clock.Advance(TimeSpan.FromSeconds(5));var restarted=f.CreateRuntime();await restarted.Recover(TestContext.Current.CancellationToken);await restarted.Refresh(TestContext.Current.CancellationToken);
        Assert.Equal(1,f.Protocol.RecoveryCalls);Assert.Equal(ClientMode.Locked,restarted.State.Mode);Assert.Equal("LOCK",f.Protocol.CurrentLease.Directive);
    }
    [Fact] public async Task FailedFinishIsReportedAsFailureAndRemainsLocallyLocked() {
        using var f=new Fixture();await f.Login();f.Protocol.FailLogout=true;
        var result=await f.Runtime.Handle(new("logout","failed-finish",SessionId:f.Session),false,TestContext.Current.CancellationToken);
        Assert.False(result.Success);Assert.Equal(ClientMode.Locked,result.State.Mode);
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
        public async Task Login() { Waiting(this); Protocol.ActivateTimeOnLogin=true; await Runtime.Refresh(TestContext.Current.CancellationToken); var response=await Runtime.Handle(new("login","pilot","customer@test","password"),false,TestContext.Current.CancellationToken); Assert.True(response.Success); Assert.Equal(ClientMode.Active,Runtime.State.Mode); }
        public string Signed<T>(T value)=>Url(JsonSerializer.SerializeToUtf8Bytes(value,new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        public string Signature(string payload)=>Url(SignatureAlgorithm.Ed25519.Sign(key,Convert.FromBase64String(payload.Replace('-','+').Replace('_','/')+new string('=',(4-payload.Length%4)%4))));
        static string Url(byte[] bytes)=>Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_');
        public void Dispose() { key.Dispose(); Directory.Delete(path,true); }
    }
    sealed class FakeProtocol:IMachineProtocolClient
    {
        public Task ClaimUpdateAsync(string bearer,Guid? requestId,CancellationToken ct)=>Task.CompletedTask;
        readonly Fixture f; public SessionLease CurrentLease; public MachineCommand Command;
        public string? Failure; public bool FailAck,PrunedAck,ActivateTimeOnLogin,FailLogout; public int AckAttempts,Authentications,RecoveryCalls;
        public FakeProtocol(Fixture fixture) { f=fixture; var now=f.Clock.GetUtcNow();
            CurrentLease=new(Guid.NewGuid(),f.Station,null,null,null,1,now,now.AddSeconds(30),now.AddSeconds(30),1,"LOCK");
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
        public Task LockAckAsync(string b,Guid s,long q,Guid? l,string r,CancellationToken ct)=>throw new InvalidOperationException("Physical ACK must never be sent by development enforcement");
        public Task<EnrollmentResult> EnrollAsync(string t,IChallengeSigner s,string v,CancellationToken ct)=>throw new NotSupportedException();
        public Task<SessionSnapshot> SnapshotAsync(string b,CancellationToken ct)=>throw new NotSupportedException();
        public Task<CustomerSession> LoginAsync(string b,string e,string p,CancellationToken ct) {
            var now=f.Clock.GetUtcNow();var customer=Guid.NewGuid();
            if(ActivateTimeOnLogin) {
                CurrentLease=CurrentLease with { Directive="ACTIVE",SessionId=f.Session,CustomerId=customer,SessionEndsAt=now.AddMinutes(75),StartedAt=now,BillingMode="TIME_BALANCE",BalanceSeconds=4500,AssignmentId=null,AssignmentExpiresAt=null,CommandCursor=1,ExpiresAt=now.AddSeconds(30),GraceEndsAt=now.AddSeconds(30) };
                Command=Command with { Sequence=1 };
            }
            return Task.FromResult(new CustomerSession(f.Session,f.Station,customer,"Customer",now,now.AddMinutes(75),now));
        }
        public Task RecoverSessionAsync(string b,Guid s,CancellationToken ct) {
            RecoveryCalls++;var now=f.Clock.GetUtcNow();long sequence=CurrentLease.CommandCursor+1;
            CurrentLease=CurrentLease with { Directive="LOCK",SessionId=null,SessionEndsAt=null,CustomerId=null,BillingMode=null,BalanceSeconds=null,CommandCursor=sequence,IssuedAt=now,ExpiresAt=now.AddSeconds(30),GraceEndsAt=now.AddSeconds(30) };
            Command=new(sequence,"SESSION_TERMINATED",1,JsonSerializer.Serialize(new {stationId=f.Station,sessionId=s}),now);
            return Task.CompletedTask;
        }
        public Task LogoutAsync(string b,Guid s,CancellationToken ct)=>FailLogout?Task.FromException(new HttpRequestException("Finish unavailable")):Task.CompletedTask;
    }
}
