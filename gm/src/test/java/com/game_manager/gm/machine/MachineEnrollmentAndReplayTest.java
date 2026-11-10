package com.game_manager.gm.machine;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.game_manager.gm.auth.RateLimitService;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.command.StationCommandRepository;
import com.game_manager.gm.machine.dto.MachineDtos.*;
import com.game_manager.gm.machine.dto.MachineDtos.EnrollRequest;
import com.game_manager.gm.machine.dto.MachineDtos.TokenRequest;
import com.game_manager.gm.security.JwtService;
import com.game_manager.gm.station.GamingStationProfile;
import com.game_manager.gm.station.GamingStationProfileRepository;
class MachineEnrollmentAndReplayTest {
 private static final Instant NOW=Instant.parse("2026-08-16T10:00:00Z");
 @Test void enrollmentTokenIsOneTimeAndExpiredTokenIsRejected()throws Exception{Fixture f=new Fixture();StationEnrollmentToken token=f.token(EnrollmentPurpose.INITIAL,NOW.plusSeconds(60));when(f.tokens.findByHashForUpdate(anyString())).thenReturn(Optional.of(token));when(f.identities.findByStationIdOrderByKeyVersionDesc(token.getStationId())).thenReturn(List.of());when(f.identities.existsByPublicKeyFingerprint(anyString())).thenReturn(false);when(f.identities.saveAndFlush(any())).thenAnswer(inv->{StationMachineIdentity i=inv.getArgument(0);i.setId(UUID.randomUUID());return i;});
  f.service.enroll(f.enroll());assertThat(token.getStatus()).isEqualTo(EnrollmentTokenStatus.CONSUMED);assertThatThrownBy(()->f.service.enroll(f.enroll())).isInstanceOf(ApplicationException.class);
  StationEnrollmentToken expired=f.token(EnrollmentPurpose.INITIAL,NOW.minusSeconds(1));when(f.tokens.findByHashForUpdate(anyString())).thenReturn(Optional.of(expired));assertThatThrownBy(()->f.service.enroll(f.enroll())).isInstanceOf(ApplicationException.class);}
 @Test void rotationKeepsOldKeyOnlyForBoundedOverlap()throws Exception{Fixture f=new Fixture();StationEnrollmentToken token=f.token(EnrollmentPurpose.ROTATION,NOW.plusSeconds(60));StationMachineIdentity old=f.identity(MachineIdentityStatus.ACTIVE);old.setKeyVersion(1L);when(f.tokens.findByHashForUpdate(anyString())).thenReturn(Optional.of(token));when(f.identities.findByStationIdOrderByKeyVersionDesc(token.getStationId())).thenReturn(List.of(old));when(f.identities.existsByPublicKeyFingerprint(anyString())).thenReturn(false);when(f.identities.saveAndFlush(any())).thenAnswer(inv->{StationMachineIdentity i=inv.getArgument(0);i.setId(UUID.randomUUID());return i;});f.service.enroll(f.enroll());assertThat(old.getStatus()).isEqualTo(MachineIdentityStatus.ROTATING);assertThat(old.getOverlapExpiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(10)));}
 @Test void successfulChallengeCannotBeReplayedAndRevokedIdentityGetsNoToken()throws Exception{Fixture f=new Fixture();KeyPair pair=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();StationMachineIdentity identity=f.identity(MachineIdentityStatus.ACTIVE);identity.setPublicKeyBase64(Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));String nonce="nonce";StationAuthChallenge challenge=new StationAuthChallenge();challenge.setId(UUID.randomUUID());challenge.setIdentityId(identity.getId());challenge.setNonceHash(MachineCrypto.hash(nonce));challenge.setExpiresAt(NOW.plusSeconds(30));when(f.identities.findByIdForUpdate(identity.getId())).thenReturn(Optional.of(identity));when(f.challenges.findByIdForUpdate(challenge.getId())).thenReturn(Optional.of(challenge));when(f.jwt.issueMachine(any(),any(),anyLong())).thenReturn(new JwtService.IssuedToken("machine-token",NOW.plusSeconds(300)));String value=challenge.getId()+":"+identity.getId()+":"+nonce;Signature signer=Signature.getInstance("Ed25519");signer.initSign(pair.getPrivate());signer.update(value.getBytes(StandardCharsets.UTF_8));TokenRequest request=new TokenRequest(identity.getId(),challenge.getId(),nonce,Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign()));f.service.token(request);assertThat(challenge.getConsumedAt()).isEqualTo(NOW);assertThatThrownBy(()->f.service.token(request)).isInstanceOf(ApplicationException.class);identity.setStatus(MachineIdentityStatus.REVOKED);challenge.setConsumedAt(null);assertThatThrownBy(()->f.service.token(request)).isInstanceOf(ApplicationException.class);}
 private static final class Fixture {final StationEnrollmentTokenRepository tokens=mock(StationEnrollmentTokenRepository.class);final StationMachineIdentityRepository identities=mock(StationMachineIdentityRepository.class);final StationAuthChallengeRepository challenges=mock(StationAuthChallengeRepository.class);final GamingStationProfileRepository stations=mock(GamingStationProfileRepository.class);final JwtService jwt=mock(JwtService.class);final MachineProtocolService service;final KeyPair pair;
  Fixture()throws Exception{pair=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();service=new MachineProtocolService(tokens,identities,challenges,mock(StationHeartbeatRepository.class),stations,mock(GamingSessionRepository.class),mock(StationCommandRepository.class),mock(MachinePrincipalProvider.class),jwt,mock(RateLimitService.class),Clock.fixed(NOW,ZoneOffset.UTC),mock(com.game_manager.gm.user.UserRepository.class),mock(org.springframework.security.crypto.password.PasswordEncoder.class),mock(MachineLoginAttemptWriter.class));}
  StationEnrollmentToken token(EnrollmentPurpose purpose,Instant expiry){StationEnrollmentToken t=new StationEnrollmentToken();t.setId(UUID.randomUUID());t.setStationId(UUID.randomUUID());t.setCreatedBy(UUID.randomUUID());t.setPurpose(purpose);t.setStatus(EnrollmentTokenStatus.ACTIVE);t.setExpiresAt(expiry);GamingStationProfile station=new GamingStationProfile();station.setResourceId(t.getStationId());station.setClientEnabled(true);when(stations.findByResourceId(t.getStationId())).thenReturn(Optional.of(station));return t;}
  StationMachineIdentity identity(MachineIdentityStatus status){StationMachineIdentity i=new StationMachineIdentity();i.setId(UUID.randomUUID());i.setStationId(UUID.randomUUID());i.setKeyVersion(1L);i.setStatus(status);return i;}
  EnrollRequest enroll(){return new EnrollRequest("one-time",Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),"test-client");}}
}
