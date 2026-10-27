package com.game_manager.gm.common.scheduling;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Local enforcement observations are separate from ordinary command acknowledgements. */
public interface ClientStatePort {
    record State(UUID sessionId, String status, Instant lastLockAckAt) {}
    record Heartbeat(String clientVersion, Instant lastSeenAt, String installationStatus,
            String updateStatus, Boolean maintenanceActive, String clientErrorCode) {}
    record History(Instant occurredAt, String action, String resultingStatus, Long commandSequence, String details) {}
    Map<UUID, State> states(Collection<UUID> stationIds);
    Optional<Heartbeat> heartbeat(UUID stationId);
    List<History> history(UUID stationId);
    boolean safeForNewSession(UUID stationId);
    void commandIssued(UUID stationId, UUID sessionId, String commandType, long sequence);
    void operatorRecovery(UUID stationId, UUID sessionId, UUID actorId, String action, long sequence, String details);
}
