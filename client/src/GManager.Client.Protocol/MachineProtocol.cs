using System.Net.Http.Headers;using System.Net.Http.Json;using System.Text.Json.Serialization;using GManager.Client.Domain;
namespace GManager.Client.Protocol;
public interface IChallengeSigner { string PublicKeyBase64 {get;} string Sign(string value); }
public interface IMachineProtocolClient {
 Task<EnrollmentResult> EnrollAsync(string token,IChallengeSigner signer,string version,CancellationToken ct);
 Task<MachineToken> AuthenticateAsync(Guid identityId,IChallengeSigner signer,CancellationToken ct);
 Task<SessionSnapshot> SnapshotAsync(string bearer,CancellationToken ct);
 Task<SignedStationPolicy> ConfigurationAsync(string bearer,CancellationToken ct);
 Task<CustomerSession> LoginAsync(string bearer,string email,string password,CancellationToken ct);
 Task LogoutAsync(string bearer,Guid sessionId,CancellationToken ct);
}
public sealed record EnrollmentResult(Guid IdentityId,Guid StationId,long KeyVersion,string Algorithm);
public sealed record MachineToken(string Token,DateTimeOffset ExpiresAt,string TokenType);
public sealed record CustomerSession(Guid SessionId,Guid StationId,Guid CustomerId,string CustomerName,DateTimeOffset StartedAt,DateTimeOffset EndsAt,DateTimeOffset ServerTime);
public sealed record SignedStationPolicy(string Payload,string Algorithm,string KeyId,string Signature);
public sealed record StationPolicy(Guid StationId,Guid ProfileId,long ConfigurationVersion,DateTimeOffset IssuedAt,IReadOnlyList<PolicyApplication> Applications);
public sealed record PolicyApplication(string Code,string Name,string Type,string ExecutablePath,string? Publisher,string? PublisherCertificateThumbprint,string? ExecutableSha256,string? MinimumFileVersion,string? Arguments,bool RequiredProcess,bool AutoStart,int LaunchOrder,string? DependencyGroup);
internal sealed record ChallengeRequest(Guid IdentityId);internal sealed record Challenge(Guid ChallengeId,Guid IdentityId,string Nonce,DateTimeOffset ExpiresAt,string SigningFormat);internal sealed record TokenRequest(Guid IdentityId,Guid ChallengeId,string Nonce,string Signature);
public sealed class MachineProtocolClient(HttpClient http):IMachineProtocolClient {
 public async Task<EnrollmentResult> EnrollAsync(string token,IChallengeSigner signer,string version,CancellationToken ct)=>await Post<EnrollmentResult>("api/v1/machine/enroll",new{enrollmentToken=token,publicKeyBase64=signer.PublicKeyBase64,clientVersion=version},null,ct);
 public async Task<MachineToken> AuthenticateAsync(Guid id,IChallengeSigner signer,CancellationToken ct){var c=await Post<Challenge>("api/v1/machine/auth/challenge",new ChallengeRequest(id),null,ct);var value=$"{c.ChallengeId}:{c.IdentityId}:{c.Nonce}";return await Post<MachineToken>("api/v1/machine/auth/token",new TokenRequest(id,c.ChallengeId,c.Nonce,signer.Sign(value)),null,ct);}
 public Task<SessionSnapshot> SnapshotAsync(string bearer,CancellationToken ct)=>Get<SessionSnapshot>("api/v1/machine/snapshot",bearer,ct);
 public Task<SignedStationPolicy> ConfigurationAsync(string bearer,CancellationToken ct)=>Get<SignedStationPolicy>("api/v1/machine/configuration",bearer,ct);
 public Task<CustomerSession> LoginAsync(string bearer,string email,string password,CancellationToken ct)=>Post<CustomerSession>("api/v1/machine/session-login",new{email,password},bearer,ct);
 public async Task LogoutAsync(string bearer,Guid sessionId,CancellationToken ct)=>_ = await Post<object>("api/v1/machine/session-logout",new{sessionId},bearer,ct);
 async Task<T> Get<T>(string path,string token,CancellationToken ct){using var request=new HttpRequestMessage(HttpMethod.Get,path);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);using var response=await http.SendAsync(request,ct);response.EnsureSuccessStatusCode();return (await response.Content.ReadFromJsonAsync<T>(cancellationToken:ct))!;}
 async Task<T> Post<T>(string path,object body,string? token,CancellationToken ct){using var request=new HttpRequestMessage(HttpMethod.Post,path){Content=JsonContent.Create(body)};if(token is not null)request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);using var response=await http.SendAsync(request,ct);response.EnsureSuccessStatusCode();if(response.StatusCode==System.Net.HttpStatusCode.NoContent)return default!;return (await response.Content.ReadFromJsonAsync<T>(cancellationToken:ct))!;}
}
