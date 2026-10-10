package com.game_manager.gm.reservation.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Anonymous occupancy intervals; no customer or reservation identifiers are exposed. */
public record ReservationBookingPlan(String timezone, Instant serverTime, LocalDate date,
        Instant startTime, Instant endTime, boolean available, String reason,
        UUID resourceId, UUID employeeId, List<DayInterval> intervals, List<Alternative> alternatives) {
    public record DayInterval(Instant startTime, Instant endTime, String status) {}
    public record Alternative(Instant startTime, Instant endTime, UUID resourceId, UUID employeeId) {}
}
