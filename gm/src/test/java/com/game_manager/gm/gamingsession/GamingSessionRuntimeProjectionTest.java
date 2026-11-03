package com.game_manager.gm.gamingsession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class GamingSessionRuntimeProjectionTest {
    @Test void pendingTransferReservesBothTheSourceAndDestination() {
        var repository=mock(GamingSessionRepository.class);var session=new GamingSession();
        session.setId(UUID.randomUUID());session.setResourceId(UUID.randomUUID());session.setMoveTargetId(UUID.randomUUID());
        when(repository.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE)).thenReturn(List.of(session));
        assertThat(new GamingSessionRuntimeProjection(repository).activeSessionIdsByResource()).containsEntry(session.getResourceId(),session.getId()).containsEntry(session.getMoveTargetId(),session.getId()).hasSize(2);
    }
}
