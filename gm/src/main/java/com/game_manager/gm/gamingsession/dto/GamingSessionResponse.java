package com.game_manager.gm.gamingsession.dto;

import com.game_manager.gm.gamingsession.*;
import java.time.*;
import java.util.UUID;

public record GamingSessionResponse(
        UUID id, UUID customerId, UUID resourceId, UUID locationId, UUID reservationId,
        UUID startedBy, Instant startedAt, Instant endsAt, Instant endedAt,
        GamingSessionStatus status, String terminationReason, long remainingSeconds,
        Instant serverTime, Long version
) {
    public static GamingSessionResponse from(GamingSession value, Instant serverTime) {
        long remaining = value.getStatus() == GamingSessionStatus.ACTIVE
                ? Math.max(0, Duration.between(serverTime, value.getEndsAt()).toSeconds()) : 0;
        return new GamingSessionResponse(value.getId(), value.getCustomerId(), value.getResourceId(),
                value.getLocationId(), value.getReservationId(), value.getStartedBy(), value.getStartedAt(),
                value.getEndsAt(), value.getEndedAt(), value.getStatus(), value.getTerminationReason(),
                remaining, serverTime, value.getVersion());
    }
}
