using System.Text.Json;
using GManager.Client.Protocol;
using GManager.Client.Service;
using Xunit;
namespace GManager.Client.Tests;
public class MeteredLeaseTests {
 [Fact] public void MeteredLeaseHasNoOfflineGraceAndPreservesDecimalTelemetry() {
  var now=DateTimeOffset.UtcNow;
  var lease=new SessionLease(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),now.AddHours(1),1,now,now.AddSeconds(30),now.AddSeconds(30),1,"ACTIVE",null,"PREPAID_METERED",now,900.00m,100.00m);
  var copy=JsonSerializer.Deserialize<SessionLease>(JsonSerializer.Serialize(lease))!;
  Assert.Equal(900.00m,copy.Balance);Assert.Equal(100.00m,copy.ChargedAmount);
  Assert.False(LeaseDeadlinePolicy.MustLock(copy,now.AddSeconds(29)));
  Assert.True(LeaseDeadlinePolicy.MustLock(copy,now.AddSeconds(30)));
 }
}
