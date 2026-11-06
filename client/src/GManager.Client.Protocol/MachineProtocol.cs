using System.Net.Http.Headers;using System.Net.Http.Json;using System.Text.Json.Serialization;using System.Text.Json;using GManager.Client.Domain;
namespace GManager.Client.Protocol;
public interface IChallengeSigner { string PublicKeyBase64 {get;} string Sign(string value); }
public interface IMachineProtocolClient {
 Task<EnrollmentResult> EnrollAsync(string token,IChallengeSigner signer,string version,CancellationToken ct);
 Task<MachineToken> AuthenticateAsync(Guid identityId,IChallengeSigner signer,CancellationToken ct);
 Task<SessionSnapshot> SnapshotAsync(string bearer,CancellationToken ct);
 Task<SignedStationPolicy> ConfigurationAsync(string bearer,CancellationToken ct);
 Task<SignedSessionLease> LeaseAsync(string bearer,CancellationToken ct);
 Task<IReadOnlyList<MachineCommand>> CommandsAsync(string bearer,long afterSequence,CancellationToken ct);
 Task AckAsync(string bearer,long sequence,CancellationToken ct);
 Task LockAckAsync(string bearer,Guid sessionId,long sequence,Guid? leaseId,string reason,CancellationToken ct);
 Task HeartbeatAsync(string bearer,Heartbeat heartbeat,CancellationToken ct);
 Task<CustomerSession> LoginAsync(string bearer,string email,string password,CancellationToken ct);
 Task<CustomerSession> GuestLoginAsync(string bearer,Guid sessionId,CancellationToken ct) => throw new NotSupportedException("Guest login is unavailable");
 Task LogoutAsync(string bearer,Guid sessionId,CancellationToken ct);
 Task RecoverSessionAsync(string bearer,Guid sessionId,CancellationToken ct)=>LogoutAsync(bearer,sessionId,ct);
 Task ClaimUpdateAsync(string bearer,Guid? requestId,CancellationToken ct);
}
public sealed record EnrollmentResult(Guid IdentityId,Guid StationId,long KeyVersion,string Algorithm);
public sealed record MachineToken(string Token,DateTimeOffset ExpiresAt,string TokenType);
public sealed record CustomerSession(Guid SessionId,Guid StationId,Guid? CustomerId,string CustomerName,DateTimeOffset StartedAt,DateTimeOffset EndsAt,DateTimeOffset ServerTime);
public sealed record SignedStationPolicy(string Payload,string Algorithm,string KeyId,string Signature);
public sealed record StationPolicy(Guid StationId,Guid ProfileId,long ConfigurationVersion,DateTimeOffset IssuedAt,IReadOnlyList<PolicyApplication> Applications);
public sealed record PolicyApplication(string Code,string Name,string Type,string ExecutablePath,string? Publisher,string? PublisherCertificateThumbprint,string? ExecutableSha256,string? MinimumFileVersion,string? Arguments,bool RequiredProcess,bool AutoStart,int LaunchOrder,string? DependencyGroup);
public sealed record SignedSessionLease(string Payload,string Algorithm,string KeyId,string Signature);
public sealed record SessionLease(Guid LeaseId,Guid StationId,Guid? SessionId,Guid? CustomerId,DateTimeOffset? SessionEndsAt,long ConfigurationVersion,DateTimeOffset IssuedAt,DateTimeOffset ExpiresAt,DateTimeOffset GraceEndsAt,long CommandCursor,string Directive,ClientUpdateDirective? ClientUpdate=null,string? BillingMode=null,DateTimeOffset? StartedAt=null,decimal? Balance=null,decimal? ChargedAmount=null,string? AccessEndReason=null,long? BalanceSeconds=null,Guid? AssignmentId=null,DateTimeOffset? AssignmentExpiresAt=null);
public sealed record ClientUpdateDirective(Guid Id,string Version,DateTimeOffset NotBefore,DateTimeOffset ExpiresAt);
public sealed record MachineCommand(long Sequence,string Type,int PayloadVersion,string Payload,DateTimeOffset AvailableAt,bool Expired=false);
public sealed record Heartbeat(string ClientVersion,string Status,long LastCommandSequence,string EnforcementStatus,Guid? SessionId,Guid? LeaseId,long ConfigurationVersion,string? InstallationStatus=null,string? UpdateStatus=null,bool? MaintenanceActive=null,string? ErrorCode=null,Guid? UpdateRequestId=null);
internal sealed record ChallengeRequest(Guid IdentityId);internal sealed record Challenge(Guid ChallengeId,Guid IdentityId,string Nonce,DateTimeOffset ExpiresAt,string SigningFormat);internal sealed record TokenRequest(Guid IdentityId,Guid ChallengeId,string Nonce,string Signature);
public sealed class MachineProtocolClient(HttpClient http, IMachineProtocolDiagnostics? diagnostics=null):IMachineProtocolClient {
 public async Task ClaimUpdateAsync(string bearer,Guid? requestId,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/client-update/claim",new{requestId},bearer,ct);
 public async Task<EnrollmentResult> EnrollAsync(string token,IChallengeSigner signer,string version,CancellationToken ct)=>await Post<EnrollmentResult>("api/v1/machine/enroll",new{enrollmentToken=token,publicKeyBase64=signer.PublicKeyBase64,clientVersion=version},null,ct);
 public async Task<MachineToken> AuthenticateAsync(Guid id,IChallengeSigner signer,CancellationToken ct){var c=await Post<Challenge>("api/v1/machine/auth/challenge",new ChallengeRequest(id),null,ct);var value=$"{c.ChallengeId}:{c.IdentityId}:{c.Nonce}";return await Post<MachineToken>("api/v1/machine/auth/token",new TokenRequest(id,c.ChallengeId,c.Nonce,signer.Sign(value)),null,ct);}
 public async Task<SessionSnapshot> SnapshotAsync(string bearer,CancellationToken ct){var value=await Get<MachineSnapshot>("api/v1/machine/snapshot",bearer,ct);return new(value.StationId,value.SessionId,value.SessionEndsAt,value.ServerTime,value.CommandCursor,value.StationStatus);}
 public Task<SignedStationPolicy> ConfigurationAsync(string bearer,CancellationToken ct)=>Get<SignedStationPolicy>("api/v1/machine/configuration",bearer,ct);
 public Task<SignedSessionLease> LeaseAsync(string bearer,CancellationToken ct)=>Get<SignedSessionLease>("api/v1/machine/lease",bearer,ct);
 public Task<IReadOnlyList<MachineCommand>> CommandsAsync(string bearer,long afterSequence,CancellationToken ct)=>Get<IReadOnlyList<MachineCommand>>($"api/v1/machine/commands?afterSequence={afterSequence}",bearer,ct);
 public async Task AckAsync(string bearer,long sequence,CancellationToken ct)=>_ = await Post<object>($"api/v1/machine/commands/{sequence}/ack",new{},bearer,ct);
 public async Task LockAckAsync(string bearer,Guid sessionId,long sequence,Guid? leaseId,string reason,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/enforcement/lock-ack",new{sessionId,commandSequence=sequence,leaseId,reason},bearer,ct);
 public async Task HeartbeatAsync(string bearer,Heartbeat heartbeat,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/heartbeat",heartbeat,bearer,ct);
 public Task<CustomerSession> LoginAsync(string bearer,string email,string password,CancellationToken ct)=>Post<CustomerSession>("api/v1/machine/session-login",new{email,password},bearer,ct);
 public Task<CustomerSession> GuestLoginAsync(string bearer,Guid sessionId,CancellationToken ct)=>Post<CustomerSession>("api/v1/machine/guest-login",new{sessionId},bearer,ct);
 public async Task RecoverSessionAsync(string bearer,Guid sessionId,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/session-logout",new{sessionId,reason="CLIENT_RECOVERY"},bearer,ct);
 public async Task LogoutAsync(string bearer,Guid sessionId,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/session-logout",new{sessionId},bearer,ct);
 async Task<T> Get<T>(string path,string token,CancellationToken ct)=>await Send<T>(HttpMethod.Get,path,null,token,ct);
 async Task<T> Post<T>(string path,object body,string? token,CancellationToken ct)=>await Send<T>(HttpMethod.Post,path,body,token,ct);
 async Task<T> Send<T>(HttpMethod method,string path,object? body,string? token,CancellationToken ct)
 {
    using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct);
    if(http.Timeout!=Timeout.InfiniteTimeSpan)timeout.CancelAfter(http.Timeout);
    var requestCt=timeout.Token;
    var operation=MachineApiErrors.Operation(path);
    int? status=null;
    MachineApiException Failure(string code,string message)=>new(new(DateTimeOffset.UtcNow,method.Method,operation.Path,status,operation.Phase,code,message));
    try
    {
        using var request=new HttpRequestMessage(method,path);
        if(body is not null)request.Content=JsonContent.Create(body);
        if(token is not null)request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
        using var response=await http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,requestCt);
        status=(int)response.StatusCode;
        if(!response.IsSuccessStatusCode)
        {
            var error=await MachineApiErrors.HttpError(response,requestCt);
            ct.ThrowIfCancellationRequested();
            throw Failure(error.Code,error.Message);
        }
        if(response.StatusCode==System.Net.HttpStatusCode.NoContent && typeof(T)==typeof(object))return default!;
        return await response.Content.ReadFromJsonAsync<T>(cancellationToken:requestCt) ?? throw Failure("API_RESPONSE_INVALID","Backend returned an empty JSON response.");
    }
    catch(MachineApiException ex) { Report(ex.Failure); throw; }
    catch(HttpRequestException ex)
    {
        if(ex.StatusCode is not null)
        {
            status=(int)ex.StatusCode.Value;
            var rejected=Failure("API_HTTP_"+status,"HTTP layer rejected the Machine API operation.");
            Report(rejected.Failure);throw rejected;
        }
        var error=Failure(status is null ? "BACKEND_UNAVAILABLE" : "API_RESPONSE_INTERRUPTED",ex.HttpRequestError switch
        {
            HttpRequestError.NameResolutionError => "Backend host name could not be resolved.",
            HttpRequestError.SecureConnectionError => "TLS connection failed; verify the backend certificate and protocol.",
            HttpRequestError.ConnectionError => "Backend connection failed or was interrupted.",
            _ => "HTTP transport failed before the operation completed."
        });
        Report(error.Failure);throw error;
    }
    catch(OperationCanceledException) when(!ct.IsCancellationRequested)
    {
        var error=Failure("BACKEND_TIMEOUT","Machine API operation timed out.");Report(error.Failure);throw error;
    }
    catch(Exception ex) when(ex is JsonException or NotSupportedException or IOException)
    {
        var error=Failure("API_RESPONSE_INVALID","Backend response could not be read as the expected Machine API JSON contract.");Report(error.Failure);throw error;
    }
 }
 void Report(MachineApiFailure failure)
 {
    // Diagnostic failures must not replace a protocol error or affect fail-closed behavior.
    try { diagnostics?.ApiFailed(failure); } catch(IOException) { } catch(UnauthorizedAccessException) { }
 }
 internal sealed record MachineSnapshot(Guid StationId,Guid? SessionId,DateTimeOffset? SessionEndsAt,DateTimeOffset ServerTime,long CommandCursor,string StationStatus);
}
