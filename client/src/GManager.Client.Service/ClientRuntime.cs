using System.Security.Cryptography;
using System.Text.Json;
using GManager.Client.Domain;
using GManager.Client.Protocol;

namespace GManager.Client.Service;

public sealed class ClientRuntime(ProtectedIdentityStore store, IMachineProtocolClient protocol, StationPolicyEnforcer policy,
    SessionLeaseVerifier leases, OperationalEventWriter events, ClientEnvironment environment,TimeProvider? timeProvider=null)
{
    readonly SemaphoreSlim gate = new(1,1);
    readonly object stateSync = new();
    public ClientViewState State { get; private set; } = ClientViewState.Locked();
    // UI telemetry only. Never used for lease validity, authorization or Windows enforcement.
    int serverConnection;
    public bool? ServerConnected => Volatile.Read(ref serverConnection) switch { 1 => true, -1 => false, _ => null };
    void ObserveServerConnection(bool connected) => Volatile.Write(ref serverConnection, connected ? 1 : -1);
    public StoredIdentity? Identity { get; private set; } = store.Load();
    string? token;
    DateTimeOffset tokenExpiry, preparingUntil;
    ClientRecoveryState? recovery;
    TrustedLeaseClock trusted = new((timeProvider??TimeProvider.System).GetUtcNow(),timeProvider);
    bool maintenance, locallyLocked, commandGap, initialized;
    public string? ErrorCode { get; private set; }
    string MaintenancePath => Path.Combine(environment.StateDirectory,"maintenance.json");

    public async Task Recover(CancellationToken ct)
    {
        if(Identity is null) { ErrorCode="ENROLLMENT_REQUIRED"; return; }
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
                trusted = new(recovery.TrustedUtcFloor,timeProvider);
            }
            var cachedPolicy = store.LoadPolicy<SignedStationPolicy>();
            cryptographicPhase=CryptographicFailurePhase.ConfigurationSignature;
            if(cachedPolicy is not null) await policy.ApplyAsync(cachedPolicy,Identity.StationId,ct);
            LockLocal("Service restart");
            if(!environment.Development && recovery?.Lease.SessionId is Guid interrupted)
                ReviewAndLogoff(interrupted,"Service restart");
            Tick();
            events.Write("RECOVERY_APPLIED",State.Mode.ToString());
        }
        catch(Exception ex) when(ex is JsonException or CryptographicException or IOException or InvalidDataException or InvalidOperationException or FormatException)
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
            if(!policy.CheckApplicationIdentity()) { ErrorCode="WINDOWS_ENFORCEMENT_UNAVAILABLE"; policy.ReapplyLocked(); }
            if(!maintenance) { policy.StopCustomerProcesses(); events.Write("MAINTENANCE_ENTER","LOCAL_ADMIN"); }
            maintenance=true;
            State=ClientViewState.Locked("Lokalni Windows administrator održava računar") with { Mode=ClientMode.Maintenance,Heading="Održavanje stanice" };
        }
        else
        {
            if(!policy.CheckApplicationIdentity()) { ErrorCode="WINDOWS_ENFORCEMENT_UNAVAILABLE"; LockLocal("Application Identity unavailable"); }
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
            development=environment.Development, enforcementVerified=policy.EnforcementVerified, errorCode=ErrorCode, serverConnected=ServerConnected,
            deadline=recovery?.Lease.GraceEndsAt
        }));
    }
    public async Task Refresh(CancellationToken ct)
    {
        if(Identity is null) { ErrorCode="ENROLLMENT_REQUIRED"; return; }
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
                LeaseRecoveryPolicy.Validate(recovery,lease);
                trusted.Observe(lease.IssuedAt);
                cryptographicPhase=CryptographicFailurePhase.ConfigurationVersion;
                if(lease.ConfigurationVersion!=policy.CurrentVersion) {
                    var exception=new CryptographicException("Lease/configuration version mismatch");
                    if(environment.Development){exception.Data[OperationalEventWriter.CurrentVersionKey]=policy.CurrentVersion;exception.Data[OperationalEventWriter.ReceivedVersionKey]=lease.ConfigurationVersion;}
                    throw exception;
                }
                PersistUpdateDirective(lease.ClientUpdate);
                cryptographicPhase=CryptographicFailurePhase.LocalAction;
                lock(stateSync) recovery=new(envelope,lease,recovery?.AppliedSequence??0,trusted.Now(),recovery?.PendingLockSequence,recovery?.PendingLockSessionId,recovery?.LocallyLocked??true,recovery?.BlockedSessionId,recovery?.PendingCommandAckSequence);
                await ReconcileCommands(ct);
                ApplyLease(lease);
                await AckPendingLock(ct);
                SaveRecovery();
            }
            ErrorCode=recovery?.BlockedSessionId is Guid blocked && blocked==recovery.Lease.SessionId && recovery.Lease.Directive=="ACTIVE" ? "SESSION_RECONCILIATION_REQUIRED" : null;
            await protocol.HeartbeatAsync(token!,Heartbeat(),ct);
            ObserveServerConnection(true);
        }
        catch(HttpRequestException ex) { ObserveServerConnection(ex.StatusCode is not null); if(ex.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden) { token=null; LockLocal("Machine authorization rejected"); } ErrorCode=ex.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden ? "ENROLLMENT_REJECTED" : "BACKEND_UNAVAILABLE"; Tick(); SaveRecovery(); }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) { ObserveServerConnection(false); ErrorCode="BACKEND_TIMEOUT"; Tick(); SaveRecovery(); }
        catch(ServerStateRollbackException) { ErrorCode="SERVER_STATE_ROLLBACK"; LockLocal("Server recovery requires reconciliation"); SaveRecovery(); events.Write("SERVER_STATE_ROLLBACK","LOCKED"); }
        catch(CryptographicException ex) { events.WriteDevelopmentCryptographicFailure("refresh",cryptographicPhase,ex); ErrorCode="SIGNATURE_REJECTED"; LockLocal("Invalid signed lease/policy"); SaveRecovery(); }
        catch(Exception ex) when(ex is IOException or InvalidDataException or InvalidOperationException or JsonException or FormatException) { ErrorCode="POLICY_FAILED"; LockLocal("Policy failed"); SaveRecovery(); }
        finally {
            initialized=true;
            try {
                if(ErrorCode is not null && token is not null)
                    try { await protocol.HeartbeatAsync(token,Heartbeat(),ct); ObserveServerConnection(true); }
                    catch(HttpRequestException ex) { ObserveServerConnection(ex.StatusCode is not null); }
                    catch(OperationCanceledException) { ObserveServerConnection(false); }
                    catch(JsonException) { }
            } finally { gate.Release(); }
        }
    }
    public async Task<LocalResponse> Handle(LocalRequest request,bool administrator,CancellationToken ct)
    {
        Tick();
        if(request.Type=="status") return new(true,environment.Development?ErrorCode:null,State,policy.VisibleApplications);
        if(request.Type=="development-reset" && environment.Development)
        {
            await gate.WaitAsync(ct);
            try
            {
                if(Identity is null) return new(false,"ENROLLMENT_REQUIRED",State);
                await EnsureToken(ct);
                var envelope=await protocol.LeaseAsync(token!,ct);
                var lease=leases.Verify(envelope,Identity.StationId);
                var snapshot=await protocol.SnapshotAsync(token!,ct);
                if(lease.SessionId is not null || lease.Directive=="ACTIVE" || snapshot.SessionId is not null)
                    return new(false,"Active server session: reset refused.",State);
                string archive=Path.Combine(environment.StateDirectory,"archives",DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmssfffffffZ"));
                Directory.CreateDirectory(archive);
                foreach(string name in new[]{"snapshot.json","station-policy.json","health.json","client.json"})
                {
                    string source=Path.Combine(environment.StateDirectory,name);
                    if(File.Exists(source)) File.Copy(source,Path.Combine(archive,name));
                }
                policy.ResetDevelopmentCache();
                lock(stateSync) recovery=new(envelope,lease,snapshot.CommandCursor,lease.IssuedAt,null,null,true);
                trusted=new(lease.IssuedAt,timeProvider);
                SaveRecovery(); ErrorCode=null;
                events.Write("DEVELOPMENT_STATE_RESET","SIMULATED");
                return new(true,null,State);
            }
            finally { gate.Release(); }
        }
        if((request.Type is "prepare-maintenance" or "prepare-update") && administrator)
        {
            await gate.WaitAsync(ct);
            try {
                if(request.Type=="prepare-update" && !maintenance && recovery is not null && !LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now())) return new(false,"Aktivna gaming sesija mora biti završena pre ažuriranja.",State);
                if(request.Type=="prepare-update" && !environment.Development) {
                    if(Identity is null)return new(false,"Stanica nije registrovana.",State);
                    try {
                        await EnsureToken(ct);
                        var intent=recovery?.Lease.ClientUpdate;
                        await protocol.ClaimUpdateAsync(token!,intent is not null && intent.ExpiresAt>trusted.Now()?intent.Id:null,ct);
                    } catch(HttpRequestException) {return new(false,"Server nije odobrio instalaciju. Proverite sesije i vezu pre ponovnog pokušaja.",State);}
                }
                preparingUntil=trusted.Now().AddSeconds(30);
                LockLocal("Local administrator");
                if(request.Type=="prepare-maintenance" && recovery?.Lease.SessionId is Guid sessionId) {
                    lock(stateSync) recovery=recovery with { BlockedSessionId=sessionId,LocallyLocked=true };
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
            if((request.Type=="login" && request.Email is not null && request.Password is not null || request.Type=="guest-login" && request.SessionId==recovery?.Lease.SessionId && recovery?.Lease.CustomerId is null) && recovery is not null && !commandGap && recovery.AppliedSequence>=recovery.Lease.CommandCursor && recovery.BlockedSessionId!=recovery.Lease.SessionId && !LeaseDeadlinePolicy.MustLock(recovery.Lease,trusted.Now()))
            {
                var result=request.Type=="guest-login" ? await protocol.GuestLoginAsync(token!,request.SessionId!.Value,ct) : await protocol.LoginAsync(token!,request.Email!,request.Password!,ct);
                ObserveServerConnection(true);
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
                if(request.SessionId is Guid sessionId) { await protocol.LogoutAsync(token!,sessionId,ct); ObserveServerConnection(true); }
                SaveRecovery();
                return new(true,null,State);
            }
            return new(false,"Zahtev nije dozvoljen u trenutnom lease stanju.",State);
        }
        catch(HttpRequestException ex) { ObserveServerConnection(ex.StatusCode is not null); Tick(); return new(false,"Server nije dostupan ili je odbio zahtev.",State); }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) { ObserveServerConnection(false); Tick(); return new(false,"Server nije odgovorio na vreme.",State); }
        catch(Exception ex) when(ex is IOException or CryptographicException or InvalidOperationException or UnauthorizedAccessException)
        { if(ex is CryptographicException cryptographicFailure)events.WriteDevelopmentCryptographicFailure("local-action",cryptographicPhase,cryptographicFailure); LockLocal("Action rejected"); return new(false,"Akcija nije bezbedno izvršena. Pozovite administratora.",State); }
        finally { gate.Release(); }
    }
    async Task ReconcileCommands(CancellationToken ct)
    {
        if(recovery is null) return;
        commandGap=false;
        // The server may have committed an ACK whose response was lost. Its endpoint is idempotent.
        await AckPendingCommand(ct);
        foreach(var command in (await protocol.CommandsAsync(token!,recovery.AppliedSequence,ct)).OrderBy(x=>x.Sequence))
        {
            var decision=CommandSequenceReducer.Decide(recovery.AppliedSequence,command.Sequence);
            if(decision==SequenceDecision.Duplicate) continue;
            if(decision==SequenceDecision.Gap) { commandGap=true; LockLocal("Command sequence gap"); break; }
            Guid sessionId=MachineCommandValidation.Validate(command,Identity!.StationId);
            if(command.Sequence>recovery.Lease.CommandCursor) { commandGap=true; LockLocal("Waiting for matching signed lease"); break; }
            if(command.Expired) {
                // Expired commands still occupy a sequence position. Never replay their side effects.
                lock(stateSync) recovery=recovery with { AppliedSequence=command.Sequence,PendingCommandAckSequence=command.Sequence };
                SaveRecovery();
                await AckPendingCommand(ct);
                continue;
            }
            if(command.Type is "SESSION_TERMINATED" or "FORCE_LOCK")
            {
                LockLocal(command.Type);
                lock(stateSync) recovery=recovery with { PendingLockSequence=command.Sequence,PendingLockSessionId=sessionId,LocallyLocked=true,BlockedSessionId=sessionId };
            }
            else if(command.Type=="SESSION_STARTED" && recovery.Lease.SessionId==sessionId && recovery.Lease.Directive=="ACTIVE" && command.Sequence<=recovery.Lease.CommandCursor)
                lock(stateSync) recovery=recovery.AcceptStarted(sessionId,command.Sequence);
            else if(command.Type is not ("SESSION_STARTED" or "SESSION_EXTENDED")) { commandGap=true; LockLocal("Unknown command"); break; }
            lock(stateSync) recovery=recovery with { AppliedSequence=command.Sequence,PendingCommandAckSequence=command.Sequence };
            SaveRecovery();
            await AckPendingCommand(ct);
        }
    }
    async Task AckPendingCommand(CancellationToken ct)
    {
        if(recovery?.PendingCommandAckSequence is not long sequence)return;
        try { await protocol.AckAsync(token!,sequence,ct); }
        catch(HttpRequestException ex) when(ex.StatusCode==System.Net.HttpStatusCode.NotFound && sequence<=recovery.AppliedSequence && sequence<=recovery.Lease.CommandCursor)
        {
            // An already-acknowledged command may have passed server retention while this Client was offline.
            // Retire only the ordinary ACK; a physical lock acknowledgement remains a separate barrier.
            events.Write("COMMAND_ACK_PRUNED","RECONCILING");
        }
        lock(stateSync) recovery=recovery with { PendingCommandAckSequence=null };
        SaveRecovery();
    }
    async Task AckPendingLock(CancellationToken ct)
    {
        if(environment.Development || maintenance || !policy.EnforcementVerified || recovery?.PendingLockSequence is not long sequence || recovery.PendingLockSessionId is not Guid sessionId || !recovery.LocallyLocked) return;
        if(recovery.Lease.Directive=="ACTIVE" && recovery.Lease.SessionId!=sessionId) { lock(stateSync) recovery=recovery with { PendingLockSequence=null,PendingLockSessionId=null }; return; }
        await protocol.LockAckAsync(token!,sessionId,sequence,recovery.Lease.LeaseId,"Client locally locked",ct);
        lock(stateSync) recovery=recovery with { PendingLockSequence=null,PendingLockSessionId=null };
    }
    void ApplyLease(SessionLease lease)
    {
        lock(stateSync)
        {
        if(maintenance) return;
        if(recovery is not null && recovery.AppliedSequence<lease.CommandCursor) { LockLocal("Waiting for ordered commands"); return; }
        if(commandGap || recovery?.BlockedSessionId==lease.SessionId && lease.SessionId is not null) { LockLocal("Local lock command"); return; }
        if(LeaseDeadlinePolicy.MustLock(lease,trusted.Now())) { LockLocal(State.BillingMode=="PREPAID_METERED" && State.EndsAt is DateTimeOffset fundedEnd && trusted.Now()>=fundedEnd ? State.AccessEndReason=="BOUNDARY"?"Prepaid pristup je zavrsen":"Prepaid kredit je potrosen" : "Backend lock/deadline"); return; }
        if(State.Mode!=ClientMode.Active || State.SessionId!=lease.SessionId)
            State=State.Apply(new(lease.StationId,lease.SessionId,lease.SessionEndsAt,lease.IssuedAt,lease.CommandCursor,"AVAILABLE"),DateTimeOffset.UtcNow);
        else State=State with { EndsAt=lease.SessionEndsAt,ServerOffset=lease.IssuedAt-DateTimeOffset.UtcNow };
        State=State with { GuestSession=lease.CustomerId is null, BillingMode=lease.BillingMode, StartedAt=lease.StartedAt, Balance=State.Mode==ClientMode.Active?lease.Balance:null, ChargedAmount=State.Mode==ClientMode.Active?lease.ChargedAmount:null, AccessEndReason=lease.AccessEndReason };
        }
    }
    void LockLocal(string reason)
    {
        lock(stateSync)
        {
        if(locallyLocked && State.Mode==ClientMode.Locked) { policy.SetSessionActive(false); return; }
        policy.StopCustomerProcesses();
        policy.SetSessionActive(false);
        policy.StopCustomerProcesses(); // Close a process that raced the policy transition.
        if(State.Mode!=ClientMode.Locked) events.Write("LOCAL_LOCK",reason);
        bool customerWasActive=State.Mode==ClientMode.Active;
        Guid? endedSession=State.SessionId;
        State=ClientViewState.Locked("Zaključano · "+reason);
        if(customerWasActive && recovery is not null && endedSession is Guid blockedSession) recovery=recovery with { BlockedSessionId=blockedSession,LocallyLocked=true };
        if(customerWasActive && !environment.Development && endedSession is Guid previous) {
            ReviewAndLogoff(previous,reason);
        }
        if(recovery is not null) recovery=recovery with { LocallyLocked=true };
        locallyLocked=true;
        }
    }
    void ReviewAndLogoff(Guid sessionId,string reason)
    {
        ProtectedIdentityStore.AtomicWrite(Path.Combine(environment.StateDirectory,"privacy-review.json"),JsonSerializer.SerializeToUtf8Bytes(new { sessionId,status="REVIEW_REQUIRED",reason,at=DateTimeOffset.UtcNow }));
        WindowsSessionPrivacy.LogOffPlayer(environment.PlayerSid!);
    }
    Heartbeat Heartbeat()=>new(environment.Version,maintenance?"MAINTENANCE":State.Mode==ClientMode.Active?"SESSION_ACTIVE":"LOCKED",recovery?.AppliedSequence??0,
        environment.Development ? (ErrorCode is null && recovery is not null && !commandGap && recovery.AppliedSequence>=recovery.Lease.CommandCursor && recovery.Lease.Directive!="ACTIVE" && State.Mode!=ClientMode.Active ? "DEV_READY" : "UNKNOWN") : maintenance || !policy.EnforcementVerified?"UNKNOWN":State.Mode==ClientMode.Active?"UNLOCKED":"LOCKED",recovery?.Lease.SessionId,recovery?.Lease.LeaseId,policy.CurrentVersion,
        environment.Development?"DEVELOPMENT":"INSTALLED",UpdateStatus(),maintenance,ErrorCode,UpdateRequestId());
    void PersistUpdateDirective(ClientUpdateDirective? value)
    {
        if(value is not null && (value.Id==Guid.Empty || !Version.TryParse(value.Version,out _) || value.NotBefore>=value.ExpiresAt))
            throw new InvalidDataException("Invalid signed update request");
        if(environment.Development)return;
        ProtectedIdentityStore.AtomicWrite(Path.Combine(environment.StateDirectory,"update-request.json"),JsonSerializer.SerializeToUtf8Bytes(value));
    }
    Guid? UpdateRequestId()
    {
        try {using var status=JsonDocument.Parse(File.ReadAllBytes(Path.Combine(environment.StateDirectory,"update-status.json")));return status.RootElement.TryGetProperty("requestId",out var id)&&id.TryGetGuid(out var value)?value:null;}
        catch(Exception ex) when(ex is IOException or JsonException or InvalidOperationException or FormatException){return null;}
    }
    string? UpdateStatus()
    {
        try { using var status=JsonDocument.Parse(File.ReadAllBytes(Path.Combine(environment.StateDirectory,"update-status.json"))); return status.RootElement.GetProperty("status").GetString(); }
        catch(IOException) { return null; } catch(JsonException) { return "UNKNOWN"; } catch(KeyNotFoundException) { return "UNKNOWN"; } catch(InvalidOperationException) { return "UNKNOWN"; }
    }
    void SaveRecovery() { lock(stateSync) if(recovery is not null) { recovery=recovery with { TrustedUtcFloor=trusted.Now() }; store.SaveSnapshot(recovery); } }
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
