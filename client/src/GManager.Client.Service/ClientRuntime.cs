using System.Security.Cryptography;
using System.Text.Json;
using GManager.Client.Domain;
using GManager.Client.Protocol;

namespace GManager.Client.Service;

public sealed class ClientRuntime(ProtectedIdentityStore store, IMachineProtocolClient protocol, StationPolicyEnforcer policy,
    SessionLeaseVerifier leases, OperationalEventWriter events, ClientEnvironment environment)
{
    readonly SemaphoreSlim gate = new(1,1);
    readonly object stateSync = new();
    public ClientViewState State { get; private set; } = ClientViewState.Locked();
    public StoredIdentity? Identity { get; private set; } = store.Load();
    string? token;
    DateTimeOffset tokenExpiry, preparingUntil;
    ClientRecoveryState? recovery;
    TrustedLeaseClock trusted = new(DateTimeOffset.UtcNow);
    bool maintenance, locallyLocked, commandGap, initialized;
    public string? ErrorCode { get; private set; }
    string MaintenancePath => Path.Combine(environment.StateDirectory,"maintenance.json");

    public async Task Recover(CancellationToken ct)
    {
        if(Identity is null) return;
        var cryptographicPhase=CryptographicFailurePhase.Recovery;
        try
        {
            recovery = store.LoadSnapshot<ClientRecoveryState>();
            if(recovery is not null)
            {
                // Never trust the unsigned projection in a persisted snapshot.
                cryptographicPhase=CryptographicFailurePhase.SessionLeaseVerification;
                var verified = leases.Verify(recovery.Envelope,Identity.StationId);
                recovery = recovery with { Lease=verified,LocallyLocked=true };
                trusted = new(recovery.TrustedUtcFloor);
            }
            var cachedPolicy = store.LoadPolicy<SignedStationPolicy>();
            cryptographicPhase=CryptographicFailurePhase.ConfigurationSignature;
            if(cachedPolicy is not null) await policy.ApplyAsync(cachedPolicy,Identity.StationId,ct);
            LockLocal("Service restart");
            Tick();
            events.Write("RECOVERY_APPLIED",State.Mode.ToString());
        }
        catch(Exception ex) when(ex is JsonException or CryptographicException or IOException or InvalidOperationException)
        {
            if(ex is CryptographicException cryptographicFailure)events.WriteDevelopmentCryptographicFailure("recovery",cryptographicPhase,cryptographicFailure);
            ErrorCode="RECOVERY_FAILED";
            LockLocal("Recovery failed");
            events.Write("RECOVERY_REJECTED","LOCKED");
        }
    }
    public void Tick()
    {
        lock(stateSync) TickCore();
    }
    void TickCore()
    {
        bool enabled=false;
        if(!environment.Development && File.Exists(MaintenancePath))
        {
            try
            {
                var value=JsonSerializer.Deserialize<MaintenanceLease>(File.ReadAllBytes(MaintenancePath),new JsonSerializerOptions { PropertyNameCaseInsensitive=true });
                enabled=value is not null && value.ExpiresAt>trusted.Now();
            }
            catch(JsonException) { ErrorCode="MAINTENANCE_STATE_INVALID"; }
            catch(IOException) { ErrorCode="MAINTENANCE_STATE_UNAVAILABLE"; }
        }
        if(enabled)
        {
            if(!maintenance) { policy.StopCustomerProcesses(); events.Write("MAINTENANCE_ENTER","LOCAL_ADMIN"); }
            maintenance=true;
            State=ClientViewState.Locked("Lokalni Windows administrator održava računar") with { Mode=ClientMode.Maintenance,Heading="Održavanje stanice" };
        }
        else
        {
            if(maintenance) {
                maintenance=false;
                ProtectedIdentityStore.AtomicWrite(MaintenancePath,JsonSerializer.SerializeToUtf8Bytes(new { ExpiresAt=DateTimeOffset.MinValue }));
                policy.ReapplyLocked();
                events.Write("MAINTENANCE_EXIT","LOCKED");
            }
            if(recovery is null || LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now())) LockLocal("Lease deadline");
        }
        ProtectedIdentityStore.AtomicWrite(Path.Combine(environment.StateDirectory,"health.json"),JsonSerializer.SerializeToUtf8Bytes(new {
            timestamp=DateTimeOffset.UtcNow, mode=State.Mode.ToString(), version=environment.Version, initialized,
            development=environment.Development, errorCode=ErrorCode,
            deadline=recovery?.Lease.GraceEndsAt
        }));
    }
    public async Task Refresh(CancellationToken ct)
    {
        if(Identity is null) return;
        await gate.WaitAsync(ct);
        var cryptographicPhase=CryptographicFailurePhase.Authentication;
        try
        {
            Tick();
            await EnsureToken(ct);
            if(!maintenance)
            {
                cryptographicPhase=CryptographicFailurePhase.ConfigurationSignature;
                await policy.ApplyAsync(await protocol.ConfigurationAsync(token!,ct),Identity.StationId,ct);
                cryptographicPhase=CryptographicFailurePhase.SessionLeaseVerification;
                var envelope=await protocol.LeaseAsync(token!,ct);
                var lease=leases.Verify(envelope,Identity.StationId);
                trusted.Observe(lease.IssuedAt);
                cryptographicPhase=CryptographicFailurePhase.ConfigurationVersion;
                if(lease.ConfigurationVersion!=policy.CurrentVersion) {
                    var exception=new CryptographicException("Lease/configuration version mismatch");
                    if(environment.Development){exception.Data[OperationalEventWriter.CurrentVersionKey]=policy.CurrentVersion;exception.Data[OperationalEventWriter.ReceivedVersionKey]=lease.ConfigurationVersion;}
                    throw exception;
                }
                cryptographicPhase=CryptographicFailurePhase.LocalAction;
                recovery=new(envelope,lease,recovery?.AppliedSequence??0,trusted.Now(),recovery?.PendingLockSequence,recovery?.PendingLockSessionId,recovery?.LocallyLocked??true,recovery?.BlockedSessionId);
                await ReconcileCommands(ct);
                ApplyLease(lease);
                await AckPendingLock(ct);
                SaveRecovery();
            }
            ErrorCode=recovery?.BlockedSessionId is Guid blocked && blocked==recovery.Lease.SessionId && recovery.Lease.Directive=="ACTIVE" ? "SESSION_RECONCILIATION_REQUIRED" : null;
            await protocol.HeartbeatAsync(token!,Heartbeat(),ct);
        }
        catch(HttpRequestException ex) { if(ex.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden) { token=null; LockLocal("Machine authorization rejected"); } ErrorCode="BACKEND_UNAVAILABLE"; Tick(); SaveRecovery(); }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) { ErrorCode="BACKEND_TIMEOUT"; Tick(); SaveRecovery(); }
        catch(CryptographicException ex) { events.WriteDevelopmentCryptographicFailure("refresh",cryptographicPhase,ex); ErrorCode="SIGNATURE_REJECTED"; LockLocal("Invalid signed lease/policy"); SaveRecovery(); }
        catch(Exception ex) when(ex is IOException or InvalidOperationException or JsonException) { ErrorCode="POLICY_FAILED"; LockLocal("Policy failed"); }
        finally {
            initialized=true;
            try {
                if(ErrorCode is not null && token is not null)
                    try { await protocol.HeartbeatAsync(token,Heartbeat(),ct); }
                    catch(HttpRequestException) { }
                    catch(OperationCanceledException) { }
                    catch(JsonException) { }
            } finally { gate.Release(); }
        }
    }
    public async Task<LocalResponse> Handle(LocalRequest request,bool administrator,CancellationToken ct)
    {
        Tick();
        if(request.Type=="status") return new(true,null,State,policy.VisibleApplications);
        if((request.Type is "prepare-maintenance" or "prepare-update") && administrator)
        {
            await gate.WaitAsync(ct);
            try {
                if(request.Type=="prepare-update" && !maintenance && recovery is not null && !LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now())) return new(false,"Aktivna gaming sesija mora biti završena pre ažuriranja.",State);
                preparingUntil=trusted.Now().AddSeconds(30);
                LockLocal("Local administrator");
                if(request.Type=="prepare-maintenance" && recovery?.Lease.SessionId is Guid sessionId) {
                    recovery=recovery with { BlockedSessionId=sessionId,LocallyLocked=true };
                    SaveRecovery();
                    ErrorCode="SESSION_RECONCILIATION_REQUIRED";
                }
                events.Write("MAINTENANCE_PREPARE","LOCAL_ADMIN"); return new(true,null,State);
            }
            finally { gate.Release(); }
        }
        if(Identity is null) return new(false,"Stanica nije registrovana.",State);
        await gate.WaitAsync(ct);
        var cryptographicPhase=CryptographicFailurePhase.Authentication;
        try
        {
            Tick();
            if(maintenance || trusted.Now()<preparingUntil) return new(false,"Stanica je u režimu održavanja.",State);
            await EnsureToken(ct);
            cryptographicPhase=CryptographicFailurePhase.LocalAction;
            if(request.Type=="login" && request.Email is not null && request.Password is not null && recovery is not null && !commandGap && recovery.AppliedSequence>=recovery.Lease.CommandCursor && recovery.BlockedSessionId!=recovery.Lease.SessionId && !LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now()))
            {
                var result=await protocol.LoginAsync(token!,request.Email,request.Password,ct);
                trusted.Observe(result.ServerTime);
                lock(stateSync)
                {
                    if(result.SessionId!=recovery.Lease.SessionId || trusted.Now()>=result.EndsAt || LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now()) || maintenance) return new(false,"Sesija više nije aktivna.",State);
                    policy.SetSessionActive(true);
                    if(LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now())) { locallyLocked=false; LockLocal("Login deadline"); return new(false,"Sesija je istekla.",State); }
                    locallyLocked=false;
                    recovery=recovery with { LocallyLocked=false };
                    State=State with { SessionId=result.SessionId,EndsAt=result.EndsAt,ServerOffset=result.ServerTime-DateTimeOffset.UtcNow };
                    State=State.Welcome(result.CustomerName);
                    return new(true,null,State,policy.VisibleApplications,policy.AutoApplications());
                }
            }
            if(request.Type=="launch" && State.Mode==ClientMode.Active && request.ApplicationCode is not null)
                return new(true,null,State,policy.VisibleApplications,[policy.Launch(request.ApplicationCode)]);
            if(request.Type=="logout" && request.SessionId==State.SessionId)
            {
                LockLocal("Customer logout");
                if(request.SessionId is Guid sessionId) await protocol.LogoutAsync(token!,sessionId,ct);
                SaveRecovery();
                return new(true,null,State);
            }
            return new(false,"Zahtev nije dozvoljen u trenutnom lease stanju.",State);
        }
        catch(HttpRequestException) { Tick(); return new(false,"Server nije dostupan ili je odbio zahtev.",State); }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) { Tick(); return new(false,"Server nije odgovorio na vreme.",State); }
        catch(Exception ex) when(ex is IOException or CryptographicException or InvalidOperationException or UnauthorizedAccessException)
        { if(ex is CryptographicException cryptographicFailure)events.WriteDevelopmentCryptographicFailure("local-action",cryptographicPhase,cryptographicFailure); LockLocal("Action rejected"); return new(false,"Akcija nije bezbedno izvršena. Pozovite administratora.",State); }
        finally { gate.Release(); }
    }
    async Task ReconcileCommands(CancellationToken ct)
    {
        if(recovery is null) return;
        commandGap=false;
        foreach(var command in (await protocol.CommandsAsync(token!,recovery.AppliedSequence,ct)).OrderBy(x=>x.Sequence))
        {
            var decision=CommandSequenceReducer.Decide(recovery.AppliedSequence,command.Sequence);
            if(decision==SequenceDecision.Duplicate) continue;
            if(decision==SequenceDecision.Gap) { commandGap=true; LockLocal("Command sequence gap"); break; }
            if(command.Expired) {
                // Expired commands still occupy a sequence position. Never replay their side effects.
                recovery=recovery with { AppliedSequence=command.Sequence };
                SaveRecovery();
                await protocol.AckAsync(token!,command.Sequence,ct);
                continue;
            }
            using var payload=JsonDocument.Parse(command.Payload);
            Guid sessionId=payload.RootElement.GetProperty("sessionId").GetGuid();
            if(command.Type is "SESSION_TERMINATED" or "FORCE_LOCK")
            {
                LockLocal(command.Type);
                recovery=recovery with { PendingLockSequence=command.Sequence,PendingLockSessionId=sessionId,LocallyLocked=true,BlockedSessionId=sessionId };
            }
            else if(command.Type is not ("SESSION_STARTED" or "SESSION_EXTENDED")) { commandGap=true; LockLocal("Unknown command"); break; }
            recovery=recovery with { AppliedSequence=command.Sequence };
            SaveRecovery();
            await protocol.AckAsync(token!,command.Sequence,ct);
        }
    }
    async Task AckPendingLock(CancellationToken ct)
    {
        if(environment.Development || maintenance || recovery?.PendingLockSequence is not long sequence || recovery.PendingLockSessionId is not Guid sessionId || !recovery.LocallyLocked) return;
        if(recovery.Lease.Directive=="ACTIVE" && recovery.Lease.SessionId!=sessionId) { recovery=recovery with { PendingLockSequence=null,PendingLockSessionId=null }; return; }
        await protocol.LockAckAsync(token!,sessionId,sequence,recovery.Lease.LeaseId,"Client locally locked",ct);
        recovery=recovery with { PendingLockSequence=null,PendingLockSessionId=null };
    }
    void ApplyLease(SessionLease lease)
    {
        lock(stateSync)
        {
        if(maintenance) return;
        if(recovery is not null && recovery.AppliedSequence<lease.CommandCursor) { LockLocal("Waiting for ordered commands"); return; }
        if(commandGap || recovery?.BlockedSessionId==lease.SessionId && lease.SessionId is not null) { LockLocal("Local lock command"); return; }
        if(LeaseDeadlinePolicy.MustLock(lease,trusted.Now())) { LockLocal("Backend lock/deadline"); return; }
        if(State.Mode!=ClientMode.Active || State.SessionId!=lease.SessionId)
            State=State.Apply(new(lease.StationId,lease.SessionId,lease.SessionEndsAt,lease.IssuedAt,lease.CommandCursor,"AVAILABLE"),DateTimeOffset.UtcNow);
        else State=State with { EndsAt=lease.SessionEndsAt,ServerOffset=lease.IssuedAt-DateTimeOffset.UtcNow };
        }
    }
    void LockLocal(string reason)
    {
        lock(stateSync)
        {
        if(locallyLocked && State.Mode==ClientMode.Locked) { policy.SetSessionActive(false); return; }
        policy.StopCustomerProcesses();
        policy.SetSessionActive(false);
        if(State.Mode!=ClientMode.Locked) events.Write("LOCAL_LOCK",reason);
        State=ClientViewState.Locked("Zaključano · "+reason);
        if(recovery is not null) recovery=recovery with { LocallyLocked=true };
        locallyLocked=true;
        }
    }
    Heartbeat Heartbeat()=>new(environment.Version,maintenance?"MAINTENANCE":State.Mode==ClientMode.Active?"SESSION_ACTIVE":"LOCKED",recovery?.AppliedSequence??0,
        environment.Development || maintenance?"UNKNOWN":State.Mode==ClientMode.Active?"UNLOCKED":"LOCKED",recovery?.Lease.SessionId,recovery?.Lease.LeaseId,policy.CurrentVersion,
        environment.Development?"DEVELOPMENT":"INSTALLED",UpdateStatus(),maintenance,ErrorCode);
    string? UpdateStatus()
    {
        try { using var status=JsonDocument.Parse(File.ReadAllBytes(Path.Combine(environment.StateDirectory,"update-status.json"))); return status.RootElement.GetProperty("status").GetString(); }
        catch(IOException) { return null; } catch(JsonException) { return "UNKNOWN"; } catch(KeyNotFoundException) { return "UNKNOWN"; } catch(InvalidOperationException) { return "UNKNOWN"; }
    }
    void SaveRecovery() { if(recovery is not null) { recovery=recovery with { TrustedUtcFloor=trusted.Now() }; store.SaveSnapshot(recovery); } }
    async Task EnsureToken(CancellationToken ct)
    {
        if(token is not null && tokenExpiry>DateTimeOffset.UtcNow.AddMinutes(1)) return;
        using var signer=new Ed25519Signer(Identity!.PrivateKey);
        var value=await protocol.AuthenticateAsync(Identity.IdentityId,signer,ct); token=value.Token; tokenExpiry=value.ExpiresAt;
    }
    sealed record MaintenanceLease(DateTimeOffset ExpiresAt);
    public void Shutdown()
    {
        if(!maintenance) LockLocal("Service stopping");
        events.Write("SERVICE_STOP","LOCAL");
    }
}
