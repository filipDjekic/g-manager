package com.game_manager.gm.reservation.dto;

import java.time.Instant;

public record ReservationHistoryResponse(String action, Instant occurredAt) {}
