using System.Diagnostics;using System.Security.Cryptography;using System.Text.Json;using GManager.Client.Protocol;using NSec.Cryptography;
namespace GManager.Client.Service;
public sealed record ClientRecoveryState(SignedSessionLease Envelope,SessionLease Lease,long AppliedSequence,DateTimeOffset TrustedUtcFloor,long? PendingLockSequence,Guid? PendingLockSessionId,bool LocallyLocked,Guid? BlockedSessionId=null,long? PendingCommandAckSequence=null)
{
 public ClientRecoveryState AcceptStarted(Guid sessionId,long sequence) => Lease.Directive=="ACTIVE" && Lease.SessionId==sessionId && sequence>0 && sequence<=Lease.CommandCursor && (PendingLockSequence is null || sequence>PendingLockSequence)
    ? this with { BlockedSessionId=null,PendingLockSequence=null,PendingLockSessionId=null } : this;
}
public sealed class SessionLeaseVerifier(IConfiguration configuration) {static readonly SignatureAlgorithm Algorithm=SignatureAlgorithm.Ed25519;
 public SessionLease Verify(SignedSessionLease envelope,Guid stationId){if(envelope.Algorithm!="Ed25519"||envelope.KeyId!=configuration["Policy:SigningKeyId"])throw new CryptographicException("Lease signing key is not trusted");byte[] payload=Decode(envelope.Payload),signature=Decode(envelope.Signature);var key=PublicKey.Import(Algorithm,Convert.FromBase64String(configuration["Policy:SigningPublicKey"]??throw new InvalidOperationException("Lease verification key is not configured")),KeyBlobFormat.PkixPublicKey);if(!Algorithm.Verify(key,payload,signature))throw new CryptographicException("Session lease signature is invalid");var lease=JsonSerializer.Deserialize<SessionLease>(payload,new JsonSerializerOptions(JsonSerializerDefaults.Web))??throw new InvalidDataException("Session lease is invalid");if(lease.StationId!=stationId)throw new CryptographicException("Session lease belongs to another station");if(lease.ExpiresAt<lease.IssuedAt||lease.GraceEndsAt<lease.ExpiresAt||lease.Directive is not ("ACTIVE" or "LOCK")||lease.Directive=="ACTIVE"&&(lease.SessionId is null||lease.SessionEndsAt is null)||lease.SessionEndsAt is not null&&lease.GraceEndsAt>lease.SessionEndsAt)throw new CryptographicException("Session lease grants an invalid grace interval");return lease;}
 static byte[] Decode(string value){var padded=value.Replace('-','+').Replace('_','/');padded+=new string('=',(4-padded.Length%4)%4);return Convert.FromBase64String(padded);}}
public sealed class TrustedLeaseClock {
 readonly object sync=new();readonly TimeProvider source;long started;DateTimeOffset anchor;
 public TrustedLeaseClock(DateTimeOffset floor,TimeProvider? timeProvider=null){source=timeProvider??TimeProvider.System;started=source.GetTimestamp();anchor=source.GetUtcNow()>floor?source.GetUtcNow():floor;}
 public DateTimeOffset Now(){lock(sync)return anchor+source.GetElapsedTime(started);}
 public void Observe(DateTimeOffset verifiedServerTime){lock(sync)if(verifiedServerTime>anchor+source.GetElapsedTime(started)){anchor=verifiedServerTime;started=source.GetTimestamp();}}
 public DateTimeOffset Floor=>Now();
}
public enum SequenceDecision { Duplicate,Apply,Gap }
public static class CommandSequenceReducer {public static SequenceDecision Decide(long applied,long incoming)=>incoming<=applied?SequenceDecision.Duplicate:incoming==applied+1?SequenceDecision.Apply:SequenceDecision.Gap;}
public static class LeaseRecoveryPolicy
{
 public static void Validate(ClientRecoveryState? previous,SessionLease incoming)
 {
  if(previous is null)return;
  if(incoming.CommandCursor<previous.AppliedSequence || incoming.CommandCursor<previous.Lease.CommandCursor || incoming.IssuedAt<previous.Lease.IssuedAt)
   throw new ServerStateRollbackException();
 }
}
public sealed class ServerStateRollbackException():CryptographicException("Server state moved behind the locally confirmed lease or command cursor; operator reconciliation is required");
public static class MachineCommandValidation
{
 public static Guid Validate(MachineCommand command,Guid stationId)
 {
  if(command.Sequence<=0 || command.PayloadVersion!=1 || command.Type is not ("SESSION_STARTED" or "SESSION_EXTENDED" or "SESSION_TERMINATED" or "FORCE_LOCK"))
   throw new InvalidDataException("Unsupported machine command");
  using var payload=JsonDocument.Parse(command.Payload);
  if(!payload.RootElement.TryGetProperty("stationId",out var scope) || !scope.TryGetGuid(out var target) || target!=stationId)
   throw new CryptographicException("Machine command belongs to another station");
  if(!payload.RootElement.TryGetProperty("sessionId",out var session) || !session.TryGetGuid(out var sessionId) || sessionId==Guid.Empty)
   throw new InvalidDataException("Machine command has no valid session");
  return sessionId;
 }
}
public static class LeaseDeadlinePolicy {public static bool MustLock(SessionLease lease,DateTimeOffset trustedNow)=>lease.Directive!="ACTIVE"||lease.SessionId is null||trustedNow>=lease.GraceEndsAt||lease.SessionEndsAt is not null&&trustedNow>=lease.SessionEndsAt;}
