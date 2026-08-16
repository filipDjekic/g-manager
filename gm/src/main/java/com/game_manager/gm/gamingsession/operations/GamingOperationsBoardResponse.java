package com.game_manager.gm.gamingsession.operations;

import java.time.Instant;
import java.util.*;

public record GamingOperationsBoardResponse(Instant serverTime, List<StationCard> stations) {
    public record StationCard(
            UUID resourceId,
            String resourceCode,
            String resourceName,
            UUID locationId,
            GamingStationBoardStatus status,
            boolean clientEnabled,
            Instant lastHeartbeatAt,
            boolean staleHeartbeat,
            String enforcementStatus,
            Instant lastLockAckAt,
            UUID sessionId,
            UUID customerId,
            String customerDisplayName,
            Instant startedAt,
            Instant endsAt,
            long remainingSeconds,
            Long sessionVersion,
            Set<GamingStationAction> allowedActions
    ) {}
}
