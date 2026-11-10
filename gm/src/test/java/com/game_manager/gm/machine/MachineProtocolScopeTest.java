package com.game_manager.gm.machine;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.springframework.data.domain.PageRequest;

import com.game_manager.gm.auth.RateLimitService;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.command.StationCommandRepository;
import com.game_manager.gm.security.JwtService;
import com.game_manager.gm.station.GamingStationProfileRepository;

class MachineProtocolScopeTest {
    @Test
    void commandPollIsBoundedAndAlwaysScopedToAuthenticatedStation() {
        UUID identity = UUID.randomUUID(), station = UUID.randomUUID();
        Instant now = Instant.parse("2026-10-30T12:00:00Z");
        StationCommandRepository commands = mock(StationCommandRepository.class);
        MachinePrincipalProvider principal = mock(MachinePrincipalProvider.class);
        when(principal.require()).thenReturn(new MachinePrincipal(identity, station, 1));
        when(commands.findByStationIdAndSequenceGreaterThanAndAvailableAtLessThanEqualOrderBySequence(
                station, 4L, now, PageRequest.of(0, 100))).thenReturn(List.of());
        RateLimitService limits = mock(RateLimitService.class);
        MachineProtocolService service = new MachineProtocolService(mock(StationEnrollmentTokenRepository.class),
                mock(StationMachineIdentityRepository.class), mock(StationAuthChallengeRepository.class),
                mock(StationHeartbeatRepository.class), mock(GamingStationProfileRepository.class),
                mock(GamingSessionRepository.class), commands, principal, mock(JwtService.class), limits,
                Clock.fixed(now, ZoneOffset.UTC), mock(com.game_manager.gm.user.UserRepository.class),
                mock(org.springframework.security.crypto.password.PasswordEncoder.class), mock(MachineLoginAttemptWriter.class));
        assertThat(service.poll(4)).isEmpty();
        verify(commands).findByStationIdAndSequenceGreaterThanAndAvailableAtLessThanEqualOrderBySequence(
                station, 4L, now, PageRequest.of(0, 100));
        verify(limits).checkMachine(identity, "poll");
    }
}
