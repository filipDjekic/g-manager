package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.UUID;

public record ReservationAnalyticsRow(UUID id, UUID employeeId, Instant startTime, Instant endTime,
        ReservationStatus status) {}
