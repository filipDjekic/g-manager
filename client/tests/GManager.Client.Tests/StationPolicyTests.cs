using GManager.Client.Domain;using GManager.Client.Protocol;using GManager.Client.Service;using Xunit;
namespace GManager.Client.Tests;
public class StationPolicyTests {
 static readonly PolicyApplication Game=new("steam-cs2","Counter-Strike 2","GAME",@"C:\Games\CS2\cs2.exe","Valve",null,null,"1.0",null,false,false,1,"steam-cs2");
 [Fact]public void AppLockerArtifactAllowsConcreteGameNotArbitraryLauncherChildren(){var launcher=new PolicyApplication("steam","Steam","LAUNCHER",@"C:\Program Files (x86)\Steam\steam.exe","Valve",null,null,null,null,true,true,0,"steam-cs2");var xml=AppLockerXml.Create(new(Guid.NewGuid(),Guid.NewGuid(),7,DateTimeOffset.UtcNow,[launcher,Game]));Assert.Contains("steam.exe",xml);Assert.Contains("cs2.exe",xml);Assert.DoesNotContain("*.exe",xml);Assert.Contains("Type=\"Script\" EnforcementMode=\"Enabled\"",xml);}
 [Fact]public void ShellLaunchContractAcceptsCodeNeverExecutablePath(){var properties=typeof(LocalRequest).GetProperties().Select(x=>x.Name).ToList();Assert.Contains("ApplicationCode",properties);Assert.DoesNotContain("ExecutablePath",properties);Assert.DoesNotContain("Arguments",properties);}
 [Fact]public void HelperIsPresentInOsPolicyButCanBeHiddenFromShellModel(){var helper=new PolicyApplication("steam-helper","Steam Helper","HELPER",@"C:\Games\Steam\helper.exe","Valve",null,null,null,null,true,true,2,"steam-cs2");var xml=AppLockerXml.Create(new(Guid.NewGuid(),Guid.NewGuid(),8,DateTimeOffset.UtcNow,[Game,helper]));Assert.Contains("helper.exe",xml);Assert.Equal("HELPER",helper.Type);}
}
