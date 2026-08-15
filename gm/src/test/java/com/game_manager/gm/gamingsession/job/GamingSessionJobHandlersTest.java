package com.game_manager.gm.gamingsession.job;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.game_manager.gm.events.OutboxWriter;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.jobs.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class GamingSessionJobHandlersTest {
    private static final Instant NOW = Instant.parse("2026-08-15T12:00:00Z");

    @Test
    void duplicateExpirationExecutionProducesOneTerminalTransitionAndOneCommand() {
        GamingSessionRepository sessions = mock(GamingSessionRepository.class);
        StationCommandWriter commands = mock(StationCommandWriter.class);
        OutboxWriter outbox = mock(OutboxWriter.class);
        JobContext context = mock(JobContext.class);
        GamingSession session = activeSession();
        when(sessions.findDueForUpdate(eq(GamingSessionStatus.ACTIVE), eq(NOW), any()))
                .thenReturn(List.of(session), List.of());
        when(sessions.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(commands.write(session, StationCommandType.SESSION_TERMINATED)).thenReturn(2L);
        GamingSessionExpirationJobHandler handler = new GamingSessionExpirationJobHandler(
                sessions, commands, outbox, Clock.fixed(NOW, ZoneOffset.UTC), new SimpleMeterRegistry());

        handler.handle(mock(JobRecord.class), context);
        handler.handle(mock(JobRecord.class), context);

        verify(commands, times(1)).write(session, StationCommandType.SESSION_TERMINATED);
        verify(outbox, times(1)).write(eq(com.game_manager.gm.events.DomainEventType.GAMING_SESSION_EXPIRED),
                eq("GAMING_SESSION"), eq(session.getId()), anyMap());
        org.assertj.core.api.Assertions.assertThat(session.getStatus()).isEqualTo(GamingSessionStatus.EXPIRED);
        org.assertj.core.api.Assertions.assertThat(session.getEndedAt()).isEqualTo(NOW);
    }

    @Test
    void reconciliationRepairsMissingProjectionOnlyOnce() {
        GamingSessionRepository sessions = mock(GamingSessionRepository.class);
        StationCommandWriter commands = mock(StationCommandWriter.class);
        StationCommandRepository commandRepository = mock(StationCommandRepository.class);
        JobContext context = mock(JobContext.class); GamingSession session = activeSession();
        when(sessions.findAll()).thenReturn(List.of(session));
        when(sessions.findByIdForUpdate(session.getId())).thenReturn(Optional.of(session));
        when(commands.matchesCurrentProjection(session)).thenReturn(false, true);
        when(commandRepository.deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(NOW)).thenReturn(0L);
        GamingSessionReconciliationJobHandler handler = new GamingSessionReconciliationJobHandler(
                sessions, commands, commandRepository, new SimpleMeterRegistry(),
                Clock.fixed(NOW, ZoneOffset.UTC), 30);

        handler.handle(mock(JobRecord.class), context);
        handler.handle(mock(JobRecord.class), context);

        verify(commands, times(1)).write(session, StationCommandType.SESSION_STARTED);
    }

    private static GamingSession activeSession() {
        GamingSession value = new GamingSession(); value.setId(UUID.randomUUID());
        value.setCustomerId(UUID.randomUUID()); value.setResourceId(UUID.randomUUID());
        value.setLocationId(UUID.randomUUID()); value.setStartedAt(NOW.minusSeconds(7200));
        value.setEndsAt(NOW.minusSeconds(1)); value.setStatus(GamingSessionStatus.ACTIVE);
        return value;
    }
}
