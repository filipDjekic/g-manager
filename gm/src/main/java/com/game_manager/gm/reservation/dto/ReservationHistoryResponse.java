package com.game_manager.gm.reservation.dto;

import java.time.Instant;

public record ReservationHistoryResponse(
        String fromStatus, String toStatus, String reason, Instant occurredAt) {}
