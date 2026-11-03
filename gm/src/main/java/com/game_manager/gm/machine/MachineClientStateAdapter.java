package com.game_manager.gm.machine;

import com.game_manager.gm.common.scheduling.ClientStatePort;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MachineClientStateAdapter implements ClientStatePort {
    private final StationClientEnforcementRepository states;
    private final StationHeartbeatRepository heartbeats;
    private final StationReconciliationAuditRepository audits;
    private final StationEnforcementProjectionService enforcement;

    @Override
    public Map<UUID, State> states(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of() : states.findByStationIdIn(ids).stream().collect(Collectors.toMap(
                StationClientEnforcement::getStationId, value -> new State(value.getSessionId(),
                        value.getEnforcementStatus().name(), value.getLastLockAckAt())));
    }

    @Override
    public Optional<Heartbeat> heartbeat(UUID stationId) {
        return heartbeats.findById(stationId).map(value -> new Heartbeat(value.getClientVersion(), value.getLastSeenAt(),
                value.getInstallationStatus(), value.getUpdateStatus(), value.getMaintenanceActive(), value.getClientErrorCode()));
    }
    @Override public Map<UUID,Heartbeat> heartbeats(Collection<UUID> ids) {
        return ids.isEmpty()?Map.of():heartbeats.findAllById(ids).stream().collect(Collectors.toMap(
                StationHeartbeat::getStationId,value->new Heartbeat(value.getClientVersion(),value.getLastSeenAt(),
                        value.getInstallationStatus(),value.getUpdateStatus(),value.getMaintenanceActive(),value.getClientErrorCode())));
    }

    @Override
    public List<History> history(UUID stationId) {
        return audits.findTop50ByStationIdOrderByOccurredAtDesc(stationId).stream().map(value -> new History(
                value.getOccurredAt(), value.getAction(), value.getResultingStatus(), value.getCommandSequence(), value.getDetails())).toList();
    }

    @Override
    public boolean safeForNewSession(UUID stationId) { return enforcement.safeForNewSession(stationId); }
    @Override
    public void commandIssued(UUID stationId, UUID sessionId, String type, long sequence) {
        enforcement.commandIssued(stationId, sessionId, type, sequence);
    }
    @Override
    public void operatorRecovery(UUID stationId, UUID sessionId, UUID actorId, String action, long sequence, String details) {
        enforcement.operatorRecovery(stationId, sessionId, actorId, action, sequence, details);
    }
}
