package com.game_manager.gm.gamingsession.operations;

import java.time.Instant;
import java.util.*;
import com.game_manager.gm.station.StationOperationalStatus;
import com.game_manager.gm.station.StationEffectiveStatus;

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
            Set<GamingStationAction> allowedActions,
            UUID areaId,
            StationOperationalStatus operationalStatus,
            StationEffectiveStatus effectiveStatus,
            String applicationProfileName,
            long configurationVersion,
            String clientVersion,
            Long commandSequence,
            String commandType,
            Instant commandAvailableAt,
            Instant commandAcknowledgedAt,
            String locationName,
            String areaName
    ) {}
}
