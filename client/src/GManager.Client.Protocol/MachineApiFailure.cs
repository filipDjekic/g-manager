using System.Net;
using System.Text.Json;

namespace GManager.Client.Protocol;

// Only these safe, locally constructed fields may cross into diagnostics. No request/response bodies.
public sealed record MachineApiFailure(DateTimeOffset Timestamp, string Method, string Path, int? StatusCode,
    string Phase, string ErrorCode, string Message)
{
    public string Summary => $"{ErrorCode}: {Method} {Path}; HTTP {StatusCode?.ToString() ?? "no response"}; phase={Phase}; {Message}";
}

public interface IMachineProtocolDiagnostics
{
    void ApiFailed(MachineApiFailure failure);
}

public sealed class MachineApiException(MachineApiFailure failure)
    : HttpRequestException(failure.Summary, null, failure.StatusCode is int status ? (HttpStatusCode)status : null)
{
    public MachineApiFailure Failure { get; } = failure;
}

internal static class MachineApiErrors
{
    public static (string Path, string Phase) Operation(string path)
    {
        string clean="/"+path.Split('?', '#')[0].TrimStart('/');
        return clean switch
        {
            "/api/v1/machine/auth/challenge" => (clean, "authentication.challenge"),
            "/api/v1/machine/auth/token" => (clean, "authentication.token"),
            "/api/v1/machine/configuration" => (clean, "configuration.fetch"),
            "/api/v1/machine/lease" => (clean, "lease.fetch"),
            "/api/v1/machine/commands" => (clean, "commands.poll"),
            "/api/v1/machine/heartbeat" => (clean, "heartbeat.send"),
            "/api/v1/machine/snapshot" => (clean, "snapshot.fetch"),
            "/api/v1/machine/enroll" => (clean, "enrollment"),
            "/api/v1/machine/enforcement/lock-ack" => (clean, "enforcement.lock-ack"),
            "/api/v1/machine/session-login" => (clean, "session.login"),
            "/api/v1/machine/session-logout" => (clean, "session.logout"),
            "/api/v1/machine/client-update/claim" => (clean, "update.claim"),
            _ when clean.StartsWith("/api/v1/machine/commands/", StringComparison.Ordinal) => ("/api/v1/machine/commands/{sequence}/ack", "commands.ack"),
            _ => ("/api/v1/machine", "protocol")
        };
    }

    public static async Task<(string Code, string Message)> HttpError(HttpResponseMessage response, CancellationToken ct)
    {
        // Backend messages can contain submitted values. Preserve only exact known static messages.
        // Bound reads even if a proxy sends HTML, an unbounded chunked response or a wrong content type.
        try
        {
            await using var stream=await response.Content.ReadAsStreamAsync(ct);
            byte[] bytes=new byte[16385];
            int count=0;
            while(count<bytes.Length)
            {
                int read=await stream.ReadAsync(bytes.AsMemory(count),ct);
                if(read==0) break;
                count+=read;
            }
            if(count<bytes.Length)
            {
                using var document=JsonDocument.Parse(bytes.AsMemory(0,count));
                if(document.RootElement.ValueKind==JsonValueKind.Object && document.RootElement.TryGetProperty("message",out var value) && value.ValueKind==JsonValueKind.String)
                {
                    if(value.GetString()=="Request validation failed" && document.RootElement.TryGetProperty("fieldErrors",out var fields) && fields.ValueKind==JsonValueKind.Array)
                    {
                        // Field names are allowlisted; validation messages/rejected values may echo secrets.
                        var names=fields.EnumerateArray().Where(field=>field.ValueKind==JsonValueKind.Object)
                            .Select(field=>field.TryGetProperty("field",out var name) && name.ValueKind==JsonValueKind.String ? name.GetString() : null)
                            .Where(name=>name is "clientVersion" or "status" or "lastCommandSequence" or "enforcementStatus"
                                or "sessionId" or "leaseId" or "configurationVersion" or "installationStatus" or "updateStatus"
                                or "maintenanceActive" or "errorCode" or "updateRequestId" or "identityId" or "challengeId"
                                or "nonce" or "signature" or "publicKeyBase64" or "enrollmentToken" or "email" or "password")
                            .Distinct().OrderBy(name=>name).ToArray();
                        if(names.Length>0)return ("API_VALIDATION_FAILED","Backend request validation failed for fields: "+string.Join(", ",names)+". Values omitted.");
                    }
                    var known=KnownMessage(value.GetString());
                    if(known is not null) return known.Value;
                }
            }
        }
        catch(JsonException) { }
        catch(IOException) { }
        catch(HttpRequestException) { }
        catch(OperationCanceledException) { }
        return ("API_HTTP_"+(int)response.StatusCode, (int)response.StatusCode switch
        {
            400 => "Backend rejected the request schema or field validation; check the Client/API contract.",
            401 => "Backend rejected machine authentication. The stored identity has been preserved.",
            403 => "Backend denied access to this machine operation.",
            404 => "Machine endpoint or required backend resource was not found.",
            409 => "Backend state conflicts with the requested operation.",
            422 => "Backend rejected station or application profile configuration.",
            429 => "Backend rate limit reached.",
            >=500 => "Backend returned a server error; inspect the backend log for this operation.",
            >=300 and <400 => "Unexpected redirect; the Client requires the direct Machine API URL.",
            _ => "Backend rejected the Machine API operation."
        });
    }

    static (string Code, string Message)? KnownMessage(string? message) => message switch
    {
        "Station profile not found" or "Enabled station profile not found" or "Station not found" => ("STATION_NOT_FOUND", message),
        "Station Client is disabled" => ("STATION_CLIENT_DISABLED", message),
        "Station has no application profile assigned" => ("APPLICATION_PROFILE_UNASSIGNED", message),
        "Assigned application profile not found" => ("APPLICATION_PROFILE_NOT_FOUND", message),
        "Assigned application profile is inactive" => ("APPLICATION_PROFILE_INACTIVE", message),
        "Active application profile not found" => ("APPLICATION_PROFILE_UNAVAILABLE", message),
        "Application profile contains an unavailable executable" => ("APPLICATION_EXECUTABLE_UNAVAILABLE", message),
        "Station policy signing key is not configured" => ("BACKEND_SIGNING_KEY_MISSING", message),
        "Station policy signing key is invalid" => ("BACKEND_SIGNING_KEY_INVALID", message),
        "Station policy could not be serialized" or "Station lease could not be serialized" => ("BACKEND_SERIALIZATION_FAILED", message),
        "Development readiness is restricted to idle local development stations" => ("DEV_STATION_NOT_READY", message),
        "Development station is not explicitly enabled in the local backend" => ("DEV_STATION_NOT_ALLOWED", message),
        "Development readiness requires the local backend profile" => ("DEV_BACKEND_PROFILE_REQUIRED", message),
        "Development readiness requires the current signed lease" => ("DEV_SIGNED_LEASE_REQUIRED", message),
        "Simulated readiness requires a Development Client" => ("DEV_CLIENT_MODE_MISMATCH", message),
        "Development session state changed; refresh the signed lease" => ("DEV_SESSION_STATE_CHANGED", message),
        "Development readiness requires an idle station" => ("DEV_STATION_HAS_ACTIVE_SESSION", message),
        "Development command cursor is stale" => ("DEV_COMMAND_CURSOR_STALE", message),
        "Machine identity is unavailable" => ("ENROLLMENT_REJECTED", message),
        "Machine challenge is invalid or expired" => ("MACHINE_AUTHENTICATION_REJECTED", message),
        "Enrollment token is invalid or expired" => ("ENROLLMENT_TOKEN_REJECTED", message),
        "Request validation failed" => ("API_VALIDATION_FAILED", "Backend request validation failed; check the Client/API field contract."),
        "Request is not valid" => ("API_REQUEST_INVALID", "Backend could not read the request; check JSON field types and enum values."),
        _ => null
    };
}
