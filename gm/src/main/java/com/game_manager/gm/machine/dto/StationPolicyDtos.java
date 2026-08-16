package com.game_manager.gm.machine.dto;
import com.game_manager.gm.station.ApplicationType;import java.time.Instant;import java.util.*;
public final class StationPolicyDtos {private StationPolicyDtos(){}
 public record PolicyApplication(String code,String name,ApplicationType type,String executablePath,String publisher,String publisherCertificateThumbprint,String executableSha256,String minimumFileVersion,String arguments,boolean requiredProcess,boolean autoStart,int launchOrder,String dependencyGroup){}
 public record UnsignedStationPolicy(UUID stationId,UUID profileId,long configurationVersion,Instant issuedAt,List<PolicyApplication> applications){}
 public record SignedStationPolicy(String payload,String algorithm,String keyId,String signature){}
}
