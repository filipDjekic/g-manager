package com.game_manager.gm.machine.dto;
import com.game_manager.gm.machine.*;import jakarta.validation.constraints.*;import java.time.Instant;import java.util.*;
public final class MachineDtos {private MachineDtos(){}
 public record EnrollmentTokenResponse(UUID tokenId,UUID stationId,EnrollmentPurpose purpose,String enrollmentToken,Instant expiresAt){}
 public record MachineIdentityView(UUID id,UUID stationId,long keyVersion,MachineIdentityStatus status,String publicKeyFingerprint,Instant enrolledAt,Instant overlapExpiresAt,Instant revokedAt,Instant lastAuthenticatedAt){}
 public record EnrollRequest(@NotBlank String enrollmentToken,@NotBlank String publicKeyBase64,@NotBlank @Size(max=60)String clientVersion){}
 public record EnrollResponse(UUID identityId,UUID stationId,long keyVersion,String algorithm){}
 public record ChallengeRequest(@NotNull UUID identityId){}
 public record ChallengeResponse(UUID challengeId,UUID identityId,String nonce,Instant expiresAt,String signingFormat){}
 public record TokenRequest(@NotNull UUID identityId,@NotNull UUID challengeId,@NotBlank String nonce,@NotBlank String signature){}
 public record MachineTokenResponse(String token,Instant expiresAt,String tokenType){}
 public record HeartbeatRequest(@NotBlank @Size(max=60)String clientVersion,@NotNull MachineClientStatus status,@PositiveOrZero long lastCommandSequence){}
 public record MachineSnapshotResponse(Instant serverTime,UUID stationId,UUID identityId,long keyVersion,String stationStatus,UUID sessionId,Instant sessionEndsAt,long commandCursor){}
 public record MachineCommandResponse(long sequence,String type,int payloadVersion,String payload,Instant availableAt){}
 public record CommandAckResponse(long sequence,Instant acknowledgedAt){}
 public record SessionLoginRequest(@NotBlank @Email @Size(max=180)String email,@NotBlank @Size(max=200)String password){}
 public record SessionLoginResponse(UUID sessionId,UUID stationId,UUID customerId,String customerName,Instant startedAt,Instant endsAt,Instant serverTime){}
 public record SessionLogoutRequest(@NotNull UUID sessionId){}
}
