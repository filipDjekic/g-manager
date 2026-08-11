package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.UUID;

public record CustomerReservationHistory(
        UUID id, String serviceName, Instant startTime, Instant endTime, ReservationStatus status) {}
