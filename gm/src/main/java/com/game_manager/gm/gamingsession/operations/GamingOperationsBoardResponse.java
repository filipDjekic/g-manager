package com.game_manager.gm.gamingsession.operations;

import com.game_manager.gm.gamingsession.GamingBillingMode;
import com.game_manager.gm.station.StationEffectiveStatus;
import com.game_manager.gm.station.StationOperationalStatus;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record GamingOperationsBoardResponse(Instant serverTime, List<StationCard> stations) {
    public record StationCard(
            UUID resourceId, String resourceCode, String resourceName, UUID locationId,
            GamingStationBoardStatus status, boolean clientEnabled, Instant lastHeartbeatAt,
            boolean staleHeartbeat, String enforcementStatus, Instant lastLockAckAt,
            UUID sessionId, UUID customerId, String customerDisplayName, Instant startedAt,
            Instant endsAt, long remainingSeconds, Long sessionVersion, Set<GamingStationAction> allowedActions,
            UUID areaId, StationOperationalStatus operationalStatus, StationEffectiveStatus effectiveStatus,
            String applicationProfileName, long configurationVersion, String clientVersion,
            Long commandSequence, String commandType, Instant commandAvailableAt, Instant commandAcknowledgedAt,
            String locationName, String areaName, UUID latestSessionId, boolean privacyReady, UUID moveTargetId,
            String clientErrorCode, String updateStatus, Boolean maintenanceActive,
            GamingBillingMode billingMode, Long billedSeconds, String clientMode,
            UUID assignmentId, Instant assignmentExpiresAt) {}
}
