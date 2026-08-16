package com.game_manager.gm.gamingsession.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.station.*;
import com.game_manager.gm.station.dto.StationResponses.StationOverview;
import com.game_manager.gm.user.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class GamingOperationsBoardServiceTest {
    private static final Instant NOW = Instant.parse("2026-08-15T12:00:00Z");

    @Test void employeeReceivesOnlyAssignedLocationWithBackendDerivedActions() {
        StationReadinessService readiness=mock(StationReadinessService.class);GamingSessionRepository sessions=mock(GamingSessionRepository.class);
        StationCommandRepository commands=mock(StationCommandRepository.class);UserRepository users=mock(UserRepository.class);
        GamingSessionLocationPolicy locations=mock(GamingSessionLocationPolicy.class);CurrentUserProvider current=mock(CurrentUserProvider.class);
        AuthenticatedUser actor=new AuthenticatedUser(UUID.randomUUID(),"employee@example.test",Role.EMPLOYEE);
        StationOverview assigned=station(UUID.randomUUID(),UUID.randomUUID()), hidden=station(UUID.randomUUID(),UUID.randomUUID());
        when(current.requireCurrentUser()).thenReturn(actor);when(readiness.overview()).thenReturn(List.of(assigned,hidden));
        when(locations.canAccess(actor,assigned.locationId())).thenReturn(true);when(locations.canAccess(actor,hidden.locationId())).thenReturn(false);
        when(sessions.findLatestCandidates(List.of(assigned.resourceId()))).thenReturn(List.of());
        when(commands.findByStationIdInOrderByStationIdAscSequenceDesc(List.of(assigned.resourceId()))).thenReturn(List.of());
        var enforcementStates=mock(com.game_manager.gm.machine.StationClientEnforcementRepository.class);when(enforcementStates.findByStationIdIn(any())).thenReturn(List.of());
        GamingOperationsBoardService service=new GamingOperationsBoardService(readiness,sessions,commands,users,locations,current,Clock.fixed(NOW,ZoneOffset.UTC),enforcementStates,mock(StationCommandWriter.class),mock(com.game_manager.gm.machine.StationEnforcementProjectionService.class),mock(com.game_manager.gm.machine.StationReconciliationAuditRepository.class));

        var response=service.board(null);

        assertThat(response.serverTime()).isEqualTo(NOW);assertThat(response.stations()).singleElement().satisfies(card->{
            assertThat(card.locationId()).isEqualTo(assigned.locationId());assertThat(card.status()).isEqualTo(GamingStationBoardStatus.AVAILABLE);
            assertThat(card.allowedActions()).containsExactly(GamingStationAction.START);});
    }

    @Test void activeProjectionContainsCustomerCountdownVersionAndSessionActions() {
        StationReadinessService readiness=mock(StationReadinessService.class);GamingSessionRepository sessions=mock(GamingSessionRepository.class);
        StationCommandRepository commands=mock(StationCommandRepository.class);UserRepository users=mock(UserRepository.class);
        GamingSessionLocationPolicy locations=mock(GamingSessionLocationPolicy.class);CurrentUserProvider current=mock(CurrentUserProvider.class);
        AuthenticatedUser actor=new AuthenticatedUser(UUID.randomUUID(),"employee@example.test",Role.EMPLOYEE);StationOverview station=station(UUID.randomUUID(),UUID.randomUUID());
        GamingSession session=new GamingSession();session.setId(UUID.randomUUID());session.setResourceId(station.resourceId());session.setCustomerId(UUID.randomUUID());
        session.setStatus(GamingSessionStatus.ACTIVE);session.setStartedAt(NOW.minusSeconds(1800));session.setEndsAt(NOW.plusSeconds(3600));session.setVersion(7L);
        User customer=new User();customer.setId(session.getCustomerId());customer.setName("Milica Manager");
        when(current.requireCurrentUser()).thenReturn(actor);when(readiness.overview()).thenReturn(List.of(station));when(locations.canAccess(actor,station.locationId())).thenReturn(true);
        when(sessions.findLatestCandidates(List.of(station.resourceId()))).thenReturn(List.of(session));when(commands.findByStationIdInOrderByStationIdAscSequenceDesc(any())).thenReturn(List.of());
        when(users.findAllById(List.of(customer.getId()))).thenReturn(List.of(customer));
        var enforcementStates=mock(com.game_manager.gm.machine.StationClientEnforcementRepository.class);when(enforcementStates.findByStationIdIn(any())).thenReturn(List.of());
        GamingOperationsBoardService service=new GamingOperationsBoardService(readiness,sessions,commands,users,locations,current,Clock.fixed(NOW,ZoneOffset.UTC),enforcementStates,mock(StationCommandWriter.class),mock(com.game_manager.gm.machine.StationEnforcementProjectionService.class),mock(com.game_manager.gm.machine.StationReconciliationAuditRepository.class));

        var card=service.board(null).stations().getFirst();

        assertThat(card.status()).isEqualTo(GamingStationBoardStatus.ACTIVE);assertThat(card.customerDisplayName()).isEqualTo("Milica Manager");
        assertThat(card.remainingSeconds()).isEqualTo(3600);assertThat(card.sessionVersion()).isEqualTo(7L);
        assertThat(card.allowedActions()).containsExactlyInAnyOrder(GamingStationAction.EXTEND,GamingStationAction.TERMINATE);
    }

    private static StationOverview station(UUID resourceId,UUID locationId){return new StationOverview(UUID.randomUUID(),resourceId,"PC-01","PC 01",UUID.randomUUID(),locationId,
            StationOperationalStatus.AVAILABLE,StationEffectiveStatus.AVAILABLE,UUID.randomUUID(),"Gaming",1,true,10,60,NOW,"1.0",null,0L);}
}
