using System.Text.Json;using GManager.Client.Protocol;using GManager.Client.Service;using Microsoft.Extensions.Configuration;using NSec.Cryptography;using Xunit;
namespace GManager.Client.Tests;
public class SessionLeaseFailureTests {
 static SessionLease Lease(DateTimeOffset now)=>new(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),now.AddMinutes(10),4,now,now.AddSeconds(30),now.AddSeconds(60),8,"ACTIVE");
 [Fact]public void NetworkLossLocksAfterFiniteLeaseGrace(){var now=DateTimeOffset.UtcNow;var lease=Lease(now);Assert.False(LeaseDeadlinePolicy.MustLock(lease,now.AddSeconds(59)));Assert.True(LeaseDeadlinePolicy.MustLock(lease,now.AddSeconds(60)));}
 [Fact]public void SessionEndAlwaysOverridesOfflineGrace(){var now=DateTimeOffset.UtcNow;var lease=Lease(now) with{SessionEndsAt=now.AddSeconds(20),GraceEndsAt=now.AddSeconds(20)};Assert.True(LeaseDeadlinePolicy.MustLock(lease,now.AddSeconds(20)));}
 [Theory][InlineData(5,5,SequenceDecision.Duplicate)][InlineData(5,6,SequenceDecision.Apply)][InlineData(5,7,SequenceDecision.Gap)]public void CommandsAreIdempotentAndOrdered(long applied,long incoming,SequenceDecision expected)=>Assert.Equal(expected,CommandSequenceReducer.Decide(applied,incoming));
 [Fact]public void TrustedClockDoesNotMoveBehindPersistedFloor(){var floor=DateTimeOffset.UtcNow.AddMinutes(5);Assert.True(new TrustedLeaseClock(floor).Now()>=floor);}
 [Fact]public void TamperedCachedLeaseIsRejectedAfterServiceOrWindowsRestart(){var algorithm=SignatureAlgorithm.Ed25519;using var key=Key.Create(algorithm,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport});var lease=Lease(DateTimeOffset.UtcNow);var payload=JsonSerializer.SerializeToUtf8Bytes(lease,new JsonSerializerOptions(JsonSerializerDefaults.Web));var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Policy:SigningKeyId","lease-key"},{"Policy:SigningPublicKey",Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey))}}).Build();var envelope=new SignedSessionLease(Url(payload),"Ed25519","lease-key",Url(algorithm.Sign(key,payload)));var verifier=new SessionLeaseVerifier(config);Assert.Equal(lease.LeaseId,verifier.Verify(envelope,lease.StationId).LeaseId);var tampered=envelope with{Payload=Url(payload.Concat(new byte[]{0}).ToArray())};Assert.ThrowsAny<Exception>(()=>verifier.Verify(tampered,lease.StationId));}
 [Fact]public void RestartStateRetainsCursorDeadlineAndPendingLockAck(){var now=DateTimeOffset.UtcNow;var lease=Lease(now);var state=new ClientRecoveryState(new("payload","Ed25519","key","signature"),lease,12,now,12,lease.SessionId,true);var restored=JsonSerializer.Deserialize<ClientRecoveryState>(JsonSerializer.Serialize(state));Assert.Equal(12,restored!.AppliedSequence);Assert.Equal(lease.GraceEndsAt,restored.Lease.GraceEndsAt);Assert.True(restored.LocallyLocked);}
 [Fact] public void GuestSignedLeaseHasTheSameDeadlineAndStationScopeAsRegisteredLease() {
  var now=DateTimeOffset.UtcNow;var lease=Lease(now) with { CustomerId=null };
  var algorithm=SignatureAlgorithm.Ed25519;using var key=Key.Create(algorithm,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport});
  var bytes=JsonSerializer.SerializeToUtf8Bytes(lease,new JsonSerializerOptions(JsonSerializerDefaults.Web));
  var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Policy:SigningKeyId","guest-key"},{"Policy:SigningPublicKey",Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey))}}).Build();
  var envelope=new SignedSessionLease(Url(bytes),"Ed25519","guest-key",Url(algorithm.Sign(key,bytes)));var verifier=new SessionLeaseVerifier(config);
  Assert.Null(verifier.Verify(envelope,lease.StationId).CustomerId);Assert.ThrowsAny<Exception>(()=>verifier.Verify(envelope,Guid.NewGuid()));
  Assert.True(LeaseDeadlinePolicy.MustLock(lease,lease.GraceEndsAt));
 }
 [Fact] public void AuthorizedReturnTransferSupersedesAnUncertainOldLockAckWithoutUnlockingLocally() {
  var now=DateTimeOffset.UtcNow;var lease=Lease(now);var session=lease.SessionId!.Value;
  var state=new ClientRecoveryState(new("payload","Ed25519","key","signature"),lease,7,now,6,session,true,session);
  Assert.Same(state,state.AcceptStarted(Guid.NewGuid(),8));Assert.Same(state,state.AcceptStarted(session,9));Assert.Same(state,state.AcceptStarted(session,6));
  var locked=state with { Lease=lease with { Directive="LOCK" } };Assert.Same(locked,locked.AcceptStarted(session,8));
  var resumed=state.AcceptStarted(session,8);Assert.Null(resumed.PendingLockSequence);Assert.Null(resumed.PendingLockSessionId);Assert.Null(resumed.BlockedSessionId);Assert.True(resumed.LocallyLocked);
 }
 static string Url(byte[] value)=>Convert.ToBase64String(value).TrimEnd('=').Replace('+','-').Replace('/','_');
}
