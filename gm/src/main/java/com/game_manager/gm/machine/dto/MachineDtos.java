package com.game_manager.gm.machine.dto;
import com.game_manager.gm.machine.*;import jakarta.validation.constraints.*;import java.time.Instant;import java.util.*;
public final class MachineDtos {private MachineDtos(){}
 public record EnrollmentTokenResponse(UUID tokenId,UUID stationId,EnrollmentPurpose purpose,String enrollmentToken,Instant expiresAt){@Override public String toString(){return "EnrollmentTokenResponse[REDACTED]";}}
 public record MachineIdentityView(UUID id,UUID stationId,long keyVersion,MachineIdentityStatus status,String publicKeyFingerprint,Instant enrolledAt,Instant overlapExpiresAt,Instant revokedAt,Instant lastAuthenticatedAt){}
 public record EnrollRequest(@NotBlank String enrollmentToken,@NotBlank String publicKeyBase64,@NotBlank @Size(max=60)String clientVersion){@Override public String toString(){return "EnrollRequest[REDACTED]";}}
 public record EnrollResponse(UUID identityId,UUID stationId,long keyVersion,String algorithm){}
 public record ChallengeRequest(@NotNull UUID identityId){}
 public record ChallengeResponse(UUID challengeId,UUID identityId,String nonce,Instant expiresAt,String signingFormat){@Override public String toString(){return "ChallengeResponse[REDACTED]";}}
 public record TokenRequest(@NotNull UUID identityId,@NotNull UUID challengeId,@NotBlank String nonce,@NotBlank String signature){@Override public String toString(){return "TokenRequest[REDACTED]";}}
 public record MachineTokenResponse(String token,Instant expiresAt,String tokenType){@Override public String toString(){return "MachineTokenResponse[REDACTED]";}}
 public record HeartbeatRequest(@NotBlank @Size(max=60)String clientVersion,@NotNull MachineClientStatus status,@PositiveOrZero long lastCommandSequence,StationEnforcementStatus enforcementStatus,UUID sessionId,UUID leaseId,@PositiveOrZero Long configurationVersion,
   @Pattern(regexp="INSTALLED|DEVELOPMENT") String installationStatus,
   @Pattern(regexp="CURRENT|DEFERRED|DOWNLOADING|FAILED|ROLLED_BACK|UNKNOWN") String updateStatus,
   Boolean maintenanceActive,@Size(max=80) @Pattern(regexp="[A-Z0-9_]+") String errorCode,UUID updateRequestId){
   public HeartbeatRequest(String clientVersion,MachineClientStatus status,long lastCommandSequence,StationEnforcementStatus enforcementStatus,UUID sessionId,UUID leaseId,Long configurationVersion){this(clientVersion,status,lastCommandSequence,enforcementStatus,sessionId,leaseId,configurationVersion,null,null,null,null,null);}
 }
 public record MachineSnapshotResponse(Instant serverTime,UUID stationId,UUID identityId,long keyVersion,String stationStatus,UUID sessionId,Instant sessionEndsAt,long commandCursor){}
 public record MachineCommandResponse(long sequence,String type,int payloadVersion,String payload,Instant availableAt,boolean expired){
  public MachineCommandResponse(long sequence,String type,int payloadVersion,String payload,Instant availableAt){this(sequence,type,payloadVersion,payload,availableAt,false);}
 }
 public record CommandAckResponse(long sequence,Instant acknowledgedAt){}
 public record SessionLoginRequest(@NotBlank @Email @Size(max=180)String email,@NotBlank @Size(max=200)String password){@Override public String toString(){return "SessionLoginRequest[REDACTED]";}}
 public record SessionLoginResponse(UUID sessionId,UUID stationId,UUID customerId,String customerName,Instant startedAt,Instant endsAt,Instant serverTime){}
 public record SessionLogoutRequest(@NotNull UUID sessionId){}
 public record SignedSessionLease(String payload,String algorithm,String keyId,String signature){}
 public record LockAckRequest(@NotNull UUID sessionId,@Positive long commandSequence,UUID leaseId,@Size(max=500)String reason){}
 public record LockAckResponse(UUID stationId,UUID sessionId,long commandSequence,Instant acknowledgedAt,String enforcementStatus){}
}
