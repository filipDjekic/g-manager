using System.Text.Json;
using GManager.Client.Protocol;
using GManager.Client.Service;
using Microsoft.Extensions.Configuration;
using NSec.Cryptography;
using Xunit;
namespace GManager.Client.Tests;
public class TimeBalanceLeaseTests {
 [Fact] public void WaitingAssignmentRemainsLockedAndHasNoGamingTimer() {
  var now=DateTimeOffset.UtcNow;var lease=new SessionLease(Guid.NewGuid(),Guid.NewGuid(),null,null,null,1,now,now.AddSeconds(30),now.AddSeconds(30),0,"LOCK",AssignmentId:Guid.NewGuid(),AssignmentExpiresAt:now.AddMinutes(5));
  var restored=JsonSerializer.Deserialize<SessionLease>(JsonSerializer.Serialize(lease))!;
  Assert.NotNull(restored.AssignmentId);Assert.Null(restored.SessionId);Assert.Null(restored.SessionEndsAt);Assert.True(LeaseDeadlinePolicy.MustLock(restored,now));
 }
 [Fact] public void TimeBalanceSurvivesRestartWithoutExtendingSignedAccess() {
  var now=DateTimeOffset.UtcNow;var lease=new SessionLease(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),now.AddMinutes(75),1,now,now.AddSeconds(30),now.AddSeconds(30),2,"ACTIVE",BillingMode:"TIME_BALANCE",StartedAt:now,BalanceSeconds:4500);
  var state=new ClientRecoveryState(new("payload","Ed25519","key","signature"),lease,2,now,null,null,true);
  var restored=JsonSerializer.Deserialize<ClientRecoveryState>(JsonSerializer.Serialize(state))!;
  Assert.Equal(4500,restored.Lease.BalanceSeconds);Assert.True(restored.LocallyLocked);
  Assert.False(LeaseDeadlinePolicy.MustLock(restored.Lease,now.AddSeconds(29)));Assert.True(LeaseDeadlinePolicy.MustLock(restored.Lease,now.AddSeconds(30)));
 }
 [Fact] public void SignedTimeBalanceRejectsExtraOfflineGraceAndAnotherStation() {
  var now=DateTimeOffset.UtcNow;var algorithm=SignatureAlgorithm.Ed25519;using var key=Key.Create(algorithm,new KeyCreationParameters{ExportPolicy=KeyExportPolicies.AllowPlaintextExport});
  var lease=new SessionLease(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),now.AddMinutes(75),1,now,now.AddSeconds(30),now.AddSeconds(30),2,"ACTIVE",BillingMode:"TIME_BALANCE",StartedAt:now,BalanceSeconds:4500);
  var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Policy:SigningKeyId","time-key"},{"Policy:SigningPublicKey",Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.PkixPublicKey))}}).Build();var verifier=new SessionLeaseVerifier(config);
  SignedSessionLease Sign(SessionLease value){var bytes=JsonSerializer.SerializeToUtf8Bytes(value,new JsonSerializerOptions(JsonSerializerDefaults.Web));return new(Url(bytes),"Ed25519","time-key",Url(algorithm.Sign(key,bytes)));}
  Assert.Equal(4500,verifier.Verify(Sign(lease),lease.StationId).BalanceSeconds);
  Assert.ThrowsAny<Exception>(()=>verifier.Verify(Sign(lease),Guid.NewGuid()));
  Assert.ThrowsAny<Exception>(()=>verifier.Verify(Sign(lease with { GraceEndsAt=now.AddSeconds(60) }),lease.StationId));
  foreach(var legacyMode in new string?[]{"PREPAID_METERED","FIXED_DURATION",null})
   Assert.ThrowsAny<Exception>(()=>verifier.Verify(Sign(lease with { BillingMode=legacyMode }),lease.StationId));
  Assert.ThrowsAny<Exception>(()=>verifier.Verify(Sign(lease with { CustomerId=null }),lease.StationId));
 }
 static string Url(byte[] value)=>Convert.ToBase64String(value).TrimEnd('=').Replace('+','-').Replace('/','_');
}
