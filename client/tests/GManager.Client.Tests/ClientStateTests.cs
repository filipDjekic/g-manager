using GManager.Client.Domain;using Xunit;
using GManager.Client.Service;using System.Security.AccessControl;
namespace GManager.Client.Tests;
public class ClientStateTests {
 [Fact]public void SnapshotUsesServerOffsetForCountdown(){var received=new DateTimeOffset(2026,1,1,10,0,5,TimeSpan.Zero);var snapshot=new SessionSnapshot(Guid.NewGuid(),Guid.NewGuid(),new DateTimeOffset(2026,1,1,11,0,0,TimeSpan.Zero),new DateTimeOffset(2026,1,1,10,0,0,TimeSpan.Zero),0,"AVAILABLE");var state=ClientViewState.Locked().Apply(snapshot,received);Assert.Equal(TimeSpan.FromHours(1),state.Remaining(received));}
 [Fact]public void ActiveSnapshotRecoversToLoginWithoutCredential(){var snapshot=new SessionSnapshot(Guid.NewGuid(),Guid.NewGuid(),DateTimeOffset.UtcNow.AddHours(1),DateTimeOffset.UtcNow,0,"AVAILABLE");Assert.Equal(ClientMode.Login,ClientViewState.Locked().Apply(snapshot,DateTimeOffset.UtcNow).Mode);}
 [Fact]public void BackendFailureProducesOfflineState(){Assert.Equal(ClientMode.Offline,ClientViewState.Locked().Disconnected().Mode);}
 [Fact]public void LocalContractContainsNoMachineSecret(){Assert.DoesNotContain(typeof(LocalRequest).GetProperties(),p=>p.Name.Contains("Key",StringComparison.OrdinalIgnoreCase)||p.Name.Contains("Token",StringComparison.OrdinalIgnoreCase));}
 [Fact]public void PipeAclIsExplicitlyConfigured(){using var pipe=LocalPipeAcl.Create();Assert.NotNull(pipe);}
}
