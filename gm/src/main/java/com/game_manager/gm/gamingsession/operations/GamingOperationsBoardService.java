package com.game_manager.gm.gamingsession.operations;

import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.station.*;
import com.game_manager.gm.station.dto.StationResponses.StationOverview;
import com.game_manager.gm.user.*;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GamingOperationsBoardService {
    private final StationReadinessService stationReadiness;
    private final GamingSessionRepository sessions;
    private final StationCommandRepository commands;
    private final UserRepository users;
    private final GamingSessionLocationPolicy locations;
    private final CurrentUserProvider currentUser;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public GamingOperationsBoardResponse board(UUID requestedLocationId) {
        AuthenticatedUser actor = currentUser.requireCurrentUser(); Instant now = clock.instant();
        if (requestedLocationId != null) locations.requireAccess(actor, requestedLocationId);
        List<StationOverview> visible = stationReadiness.overview().stream()
                .filter(station -> locations.canAccess(actor, station.locationId()))
                .filter(station -> requestedLocationId == null || requestedLocationId.equals(station.locationId()))
                .toList();
        if (visible.isEmpty()) return new GamingOperationsBoardResponse(now, List.of());
        List<UUID> resourceIds = visible.stream().map(StationOverview::resourceId).toList();
        Map<UUID,GamingSession> latest = sessions.findLatestCandidates(resourceIds).stream()
                .collect(Collectors.toMap(GamingSession::getResourceId, Function.identity(), (first, ignored) -> first,
                        LinkedHashMap::new));
        Map<UUID,StationCommand> latestCommand = commands
                .findByStationIdInOrderByStationIdAscSequenceDesc(resourceIds).stream()
                .collect(Collectors.toMap(StationCommand::getStationId, Function.identity(), (first, ignored) -> first));
        Map<UUID,User> customers = users.findAllById(latest.values().stream()
                        .map(GamingSession::getCustomerId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        List<GamingOperationsBoardResponse.StationCard> cards = visible.stream()
                .map(station -> card(station, latest.get(station.resourceId()),
                        latestCommand.get(station.resourceId()), customers, actor, now))
                .toList();
        return new GamingOperationsBoardResponse(now, cards);
    }

    private GamingOperationsBoardResponse.StationCard card(StationOverview station, GamingSession latest,
            StationCommand latestCommand, Map<UUID,User> customers, AuthenticatedUser actor, Instant now) {
        GamingSession active = latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE ? latest : null;
        GamingStationBoardStatus status = status(station, latest, latestCommand, now);
        EnumSet<GamingStationAction> allowed = EnumSet.noneOf(GamingStationAction.class);
        if ((status == GamingStationBoardStatus.AVAILABLE || status == GamingStationBoardStatus.EXPIRED)
                && (latest == null || latest.getStatus() != GamingSessionStatus.ACTIVE)
                && station.applicationProfileId() != null
                && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_START))
            allowed.add(GamingStationAction.START);
        if (status == GamingStationBoardStatus.ACTIVE && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_EXTEND))
            allowed.add(GamingStationAction.EXTEND);
        if (status == GamingStationBoardStatus.ACTIVE && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_TERMINATE))
            allowed.add(GamingStationAction.TERMINATE);
        User customer = active == null ? null : customers.get(active.getCustomerId());
        return new GamingOperationsBoardResponse.StationCard(station.resourceId(), station.resourceCode(),
                station.resourceName(), station.locationId(), status, station.clientEnabled(),
                station.lastHeartbeatAt(), active == null ? null : active.getId(),
                active == null ? null : active.getCustomerId(), customer == null ? null : customer.getName(),
                active == null ? null : active.getStartedAt(), active == null ? null : active.getEndsAt(),
                active == null ? 0 : Math.max(0, Duration.between(now, active.getEndsAt()).toSeconds()),
                active == null ? null : active.getVersion(), Set.copyOf(allowed));
    }

    private GamingStationBoardStatus status(StationOverview station, GamingSession latest,
            StationCommand latestCommand, Instant now) {
        if (station.operationalStatus() == StationOperationalStatus.MAINTENANCE)
            return GamingStationBoardStatus.MAINTENANCE;
        if (station.operationalStatus() == StationOperationalStatus.RETIRED)
            return GamingStationBoardStatus.RETIRED;
        if (latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE
                && !latest.getEndsAt().isAfter(now))
            return GamingStationBoardStatus.EXPIRED;
        if (latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE)
            return GamingStationBoardStatus.ACTIVE;
        if (station.effectiveStatus() == StationEffectiveStatus.OFFLINE)
            return GamingStationBoardStatus.OFFLINE;
        if (station.clientEnabled() && latest != null && latest.getStatus() != GamingSessionStatus.ACTIVE
                && latestCommand != null && latestCommand.getSessionId().equals(latest.getId())
                && latestCommand.getCommandType() == StationCommandType.SESSION_TERMINATED
                && latestCommand.getAcknowledgedAt() == null)
            return GamingStationBoardStatus.LOCK_PENDING;
        if (latest != null && latest.getStatus() == GamingSessionStatus.EXPIRED)
            return GamingStationBoardStatus.EXPIRED;
        return GamingStationBoardStatus.AVAILABLE;
    }
}
