package com.game_manager.gm.gamingsession.job;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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
    void expirationDelegatesToAuthoritativeTimeAccountingWithoutTakingSessionLocksFirst() {
        GamingSessionRepository sessions = mock(GamingSessionRepository.class);
        var time = mock(com.game_manager.gm.gamingsession.billing.GamingTimeService.class);
        JobContext context = mock(JobContext.class);
        GamingSession session = activeSession();
        when(sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE))
                .thenReturn(List.of(session), List.of());
        var handler = new GamingSessionExpirationJobHandler(sessions, time, new SimpleMeterRegistry());
        handler.handle(mock(JobRecord.class), context);
        handler.handle(mock(JobRecord.class), context);
        verify(time).tick(session.getId(), false, false);
        verify(sessions, never()).findByIdForUpdate(any());
        verifyNoMoreInteractions(time);
    }

    @Test
    void reconciliationRepairsMissingProjectionOnlyOnce() {
        GamingSessionRepository sessions = mock(GamingSessionRepository.class);
        StationCommandWriter commands = mock(StationCommandWriter.class);
        StationCommandRepository commandRepository = mock(StationCommandRepository.class);
        JobContext context = mock(JobContext.class); GamingSession session = activeSession();
        when(sessions.findReconciliationIds(any(), isNull(), any())).thenReturn(List.of(session.getId()));
        when(sessions.findReconciliationIds(any(), eq(session.getId()), any())).thenReturn(List.of());
        when(sessions.findByIdForUpdate(session.getId())).thenReturn(Optional.of(session));
        when(commands.matchesCurrentProjection(session)).thenReturn(false, true);
        when(commandRepository.deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(NOW)).thenReturn(0L);
        var transactionManager = mock(org.springframework.transaction.PlatformTransactionManager.class);
        when(transactionManager.getTransaction(any())).thenAnswer(invocation ->
                new org.springframework.transaction.support.SimpleTransactionStatus());
        GamingSessionReconciliationJobHandler handler = new GamingSessionReconciliationJobHandler(
                sessions, commands, commandRepository, new SimpleMeterRegistry(),
                Clock.fixed(NOW, ZoneOffset.UTC), 30, transactionManager);

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
