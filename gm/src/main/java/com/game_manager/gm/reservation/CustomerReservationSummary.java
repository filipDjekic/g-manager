package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.UUID;

public record CustomerReservationSummary(
        UUID customerId, long reservationCount, long completedCount, Instant lastReservationAt) {}
