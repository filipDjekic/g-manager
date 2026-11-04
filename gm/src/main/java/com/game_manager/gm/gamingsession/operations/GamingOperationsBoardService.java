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
    private final com.game_manager.gm.station.StationPreparationService preparation;
    private final com.game_manager.gm.gamingsession.billing.GamingBillingService billing;
    private final StationReadinessService stationReadiness;
    private final GamingSessionRepository sessions;
    private final StationCommandRepository commands;
    private final UserRepository users;
    private final GamingSessionLocationPolicy locations;
    private final CurrentUserProvider currentUser;
    private final Clock clock;
    private final StationCommandWriter commandWriter;
    private final com.game_manager.gm.common.scheduling.ClientStatePort enforcement;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public GamingOperationsBoardResponse board(UUID requestedLocationId) {
        AuthenticatedUser actor = currentUser.requireCurrentUser(); Instant now = clock.instant();
        if (requestedLocationId != null) locations.requireAccess(actor, requestedLocationId);
        Set<UUID> assigned = locations.assignedResources(actor);
        List<StationOverview> visible = stationReadiness.overview().stream()
                .filter(station -> actor.role() == Role.OWNER || actor.role() == Role.ADMIN
                        || assigned.contains(station.resourceId()))
                .filter(station -> requestedLocationId == null || requestedLocationId.equals(station.locationId()))
                .toList();
        if (visible.isEmpty()) return new GamingOperationsBoardResponse(now, List.of());
        List<UUID> resourceIds = visible.stream().map(StationOverview::resourceId).toList();
        Map<UUID,GamingSession> latest = sessions.findLatestCandidates(resourceIds).stream()
                .collect(Collectors.toMap(GamingSession::getResourceId, Function.identity(), (first, ignored) -> first,
                        LinkedHashMap::new));
        Map<UUID,StationCommandSummary> latestCommand = commands
                .findLatestSummariesByStationIdIn(resourceIds).stream()
                .filter(command -> command.sequence() != null)
                .collect(Collectors.toMap(StationCommandSummary::stationId, Function.identity()));
        var enforcementByStation=enforcement.states(resourceIds);
        var clientHealth=enforcement.heartbeats(resourceIds);
        var ready=preparation.readiness(resourceIds);
        Set<UUID> incoming=sessions.findByMoveTargetIdInAndStatus(resourceIds,GamingSessionStatus.ACTIVE).stream().map(GamingSession::getMoveTargetId).collect(Collectors.toSet());
        var balances=billing.balances(latest.values().stream().filter(v->v.getBillingMode()==GamingBillingMode.PREPAID_METERED).map(GamingSession::getCustomerId).filter(Objects::nonNull).distinct().toList());
        var due=billing.dues(latest.values().stream().map(GamingSession::getId).toList());
        Map<UUID,User> customers = users.findAllById(latest.values().stream()
                        .map(GamingSession::getCustomerId).filter(Objects::nonNull).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        List<GamingOperationsBoardResponse.StationCard> cards = visible.stream()
                .map(station -> card(station, latest.get(station.resourceId()),
                        latestCommand.get(station.resourceId()),enforcementByStation.get(station.resourceId()), customers, actor, now,ready.getOrDefault(station.resourceId(),true),incoming.contains(station.resourceId()),due,clientHealth.get(station.resourceId()),balances))
                .toList();
        return new GamingOperationsBoardResponse(now, cards);
    }

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public StationHistoryResponse history(UUID stationId){AuthenticatedUser actor=currentUser.requireCurrentUser();StationOverview station=stationReadiness.overview().stream().filter(value->value.resourceId().equals(stationId)).findFirst().orElseThrow();locations.requireResourceAccess(actor,station.resourceId());
        var auditEntries=enforcement.history(stationId).stream().map(value->new StationHistoryResponse.Entry(value.occurredAt(),"ENFORCEMENT",value.action(),value.resultingStatus(),value.commandSequence(),null,value.details()));
        var commandEntries=commands.findTop50ByStationIdOrderBySequenceDesc(stationId).stream().map(value->new StationHistoryResponse.Entry(value.getAvailableAt(),"COMMAND",value.getCommandType().name(),value.getAcknowledgedAt()==null?"PENDING":"ACKNOWLEDGED",value.getSequence(),value.getCorrelationId(),null));
        var entries=java.util.stream.Stream.concat(auditEntries,commandEntries).sorted(java.util.Comparator.comparing(StationHistoryResponse.Entry::occurredAt).reversed()).limit(50).toList();return new StationHistoryResponse(clock.instant(),stationId,entries);}

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public com.game_manager.gm.common.dto.PageResponse<StationHistoryResponse.Entry> historyPage(UUID stationId,int page,int size){
        var actor=currentUser.requireCurrentUser();locations.requireResourceAccess(actor,stationId);
        return com.game_manager.gm.common.dto.PageResponse.from(commands.historyPage(stationId.toString(),com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted())).map(row->new StationHistoryResponse.Entry(row.getOccurredAt(),row.getCategory(),row.getAction(),row.getStatus(),row.getCommandSequence(),row.getCorrelationId(),row.getDetails())));
    }

    private GamingOperationsBoardResponse.StationCard card(StationOverview station, GamingSession latest,
            StationCommandSummary latestCommand,com.game_manager.gm.common.scheduling.ClientStatePort.State enforcementState, Map<UUID,User> customers, AuthenticatedUser actor, Instant now,boolean privacyReady,boolean incoming,Map<UUID,java.math.BigDecimal> due,com.game_manager.gm.common.scheduling.ClientStatePort.Heartbeat health,Map<UUID,java.math.BigDecimal> balances) {
        GamingSession active = latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE ? latest : null;
        boolean stale=station.clientEnabled()&&(station.lastHeartbeatAt()==null||!station.lastHeartbeatAt().plusSeconds(station.offlineGraceSeconds()).isAfter(now));
        GamingStationBoardStatus status = status(station, latest, enforcementState, stale,now,privacyReady,incoming);
        if(!stale && station.clientEnabled() && health!=null && Boolean.TRUE.equals(health.maintenanceActive()))status=GamingStationBoardStatus.MAINTENANCE;
        if(!stale && station.clientEnabled() && health!=null && health.clientErrorCode()!=null && status==GamingStationBoardStatus.AVAILABLE)status=GamingStationBoardStatus.CLIENT_ERROR;
        if(!stale && station.clientEnabled() && (enforcementState==null || !"LOCKED".equals(enforcementState.status())) && status==GamingStationBoardStatus.AVAILABLE)status=GamingStationBoardStatus.CLIENT_ERROR;
        EnumSet<GamingStationAction> allowed = EnumSet.noneOf(GamingStationAction.class);
        if ((status == GamingStationBoardStatus.AVAILABLE || status == GamingStationBoardStatus.EXPIRED)
                && (latest == null || latest.getStatus() != GamingSessionStatus.ACTIVE)
                && privacyReady && !incoming
                && station.applicationProfileId() != null
                && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_START))
            allowed.add(GamingStationAction.START);
        if (status == GamingStationBoardStatus.ACTIVE && active!=null && active.getMoveTargetId()==null && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_EXTEND))
            allowed.add(GamingStationAction.EXTEND);
        if ((status == GamingStationBoardStatus.ACTIVE||(status==GamingStationBoardStatus.OFFLINE||status==GamingStationBoardStatus.LOCK_PENDING)&&active!=null) && RolePermissions.has(actor.role(), Permission.GAMING_SESSION_TERMINATE))
            allowed.add(GamingStationAction.TERMINATE);
        if ((status==GamingStationBoardStatus.LOCK_PENDING||status==GamingStationBoardStatus.OFFLINE&&(enforcementState==null||!"LOCKED".equals(enforcementState.status())))&&latest!=null&&latest.getStatus()!=GamingSessionStatus.ACTIVE&&RolePermissions.has(actor.role(),Permission.GAMING_SESSION_TERMINATE)){allowed.add(GamingStationAction.FORCE_LOCK);allowed.add(GamingStationAction.CONFIRM_LOCKED);}
        if(active!=null && active.getBillingMode()==GamingBillingMode.PREPAID_METERED)allowed.remove(GamingStationAction.EXTEND);
        if(health!=null && health.clientErrorCode()!=null)allowed.remove(GamingStationAction.START);
        User customer = active == null ? null : customers.get(active.getCustomerId());
        return new GamingOperationsBoardResponse.StationCard(station.resourceId(), station.resourceCode(),
                station.resourceName(), station.locationId(), status, station.clientEnabled(),
                station.lastHeartbeatAt(),stale,stale?"OFFLINE":enforcementState==null?"UNKNOWN":enforcementState.status(),enforcementState==null?null:enforcementState.lastLockAckAt(), active == null ? null : active.getId(),
                active == null ? null : active.getCustomerId(), active!=null && active.getCustomerId()==null ? "Gost - "+active.getGuestName() : customer == null ? null : customer.getName(),
                active == null ? null : active.getStartedAt(), active == null ? null : active.getEndsAt(),
                active == null ? 0 : active.getMoveRemainingSeconds()!=null ? active.getMoveRemainingSeconds() : Math.max(0, Duration.between(now, active.getEndsAt()).toSeconds()),
                active == null ? null : active.getVersion(), Set.copyOf(allowed),
                station.areaId(), station.operationalStatus(), station.effectiveStatus(),
                station.applicationProfileName(), station.configurationVersion(), station.clientVersion(),
                latestCommand == null ? null : latestCommand.sequence(),
                latestCommand == null ? null : latestCommand.commandType().name(),
                latestCommand == null ? null : latestCommand.availableAt(),
                latestCommand == null ? null : latestCommand.acknowledgedAt(), station.locationName(), station.areaName(), latest==null?null:latest.getId(), active==null?null:due.getOrDefault(active.getId(),java.math.BigDecimal.ZERO), privacyReady, active==null?null:active.getMoveTargetId(),health==null?null:health.clientErrorCode(),health==null?null:health.updateStatus(),health==null?null:health.maintenanceActive(),active==null?null:active.getBillingMode(),active==null?null:active.getBilledSeconds(),active==null?null:active.getChargedAmount(),active==null || active.getCustomerId()==null?null:balances.get(active.getCustomerId()));
    }

    private GamingStationBoardStatus status(StationOverview station, GamingSession latest,
            com.game_manager.gm.common.scheduling.ClientStatePort.State enforcementState,boolean stale, Instant now,boolean privacyReady,boolean incoming) {
        if (station.operationalStatus() == StationOperationalStatus.MAINTENANCE)
            return GamingStationBoardStatus.MAINTENANCE;
        if (station.operationalStatus() == StationOperationalStatus.RETIRED)
            return GamingStationBoardStatus.RETIRED;
        if(incoming) return GamingStationBoardStatus.TRANSFER_PENDING;
        if(latest!=null && latest.getStatus()==GamingSessionStatus.ACTIVE && latest.getMoveTargetId()!=null) return GamingStationBoardStatus.LOCK_PENDING;
        if (latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE
                && !latest.getEndsAt().isAfter(now))
            return GamingStationBoardStatus.EXPIRED;
        if (station.clientEnabled()&&latest!=null&&latest.getStatus()!=GamingSessionStatus.ACTIVE&&(enforcementState==null||!latest.getId().equals(enforcementState.sessionId())||!"LOCKED".equals(enforcementState.status())))return GamingStationBoardStatus.LOCK_PENDING;
        if (stale)return GamingStationBoardStatus.OFFLINE;
        if (latest != null && latest.getStatus() == GamingSessionStatus.ACTIVE)return GamingStationBoardStatus.ACTIVE;
        if (!station.clientEnabled()&&latest != null && latest.getStatus() == GamingSessionStatus.EXPIRED)
            return GamingStationBoardStatus.EXPIRED;
        if(!privacyReady) return GamingStationBoardStatus.PREPARATION_REQUIRED;
        return GamingStationBoardStatus.AVAILABLE;
    }

    @Transactional@PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")public void forceLock(UUID stationId){AuthenticatedUser actor=currentUser.requireCurrentUser();StationOverview station=stationReadiness.overview().stream().filter(value->value.resourceId().equals(stationId)).findFirst().orElseThrow();locations.requireResourceManagement(actor,station.resourceId(),Permission.GAMING_SESSION_TERMINATE);GamingSession session=sessions.findLatestCandidates(List.of(stationId)).stream().findFirst().filter(value->value.getStatus()!=GamingSessionStatus.ACTIVE).orElseThrow();long sequence=commandWriter.write(session,StationCommandType.FORCE_LOCK);enforcement.operatorRecovery(stationId,session.getId(),actor.id(),"FORCE_LOCK",sequence,"Operator requested force lock");}
    @Transactional@PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")public void confirmLocked(UUID stationId){AuthenticatedUser actor=currentUser.requireCurrentUser();StationOverview station=stationReadiness.overview().stream().filter(value->value.resourceId().equals(stationId)).findFirst().orElseThrow();locations.requireResourceManagement(actor,station.resourceId(),Permission.GAMING_SESSION_TERMINATE);GamingSession session=sessions.findLatestCandidates(List.of(stationId)).stream().findFirst().filter(value->value.getStatus()!=GamingSessionStatus.ACTIVE).orElseThrow();enforcement.operatorRecovery(stationId,session.getId(),actor.id(),"OPERATOR_RECOVERY",session.getLastCommandSequence()==null?0:session.getLastCommandSequence(),"Operator verified local lock");}
}
