package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.UUID;

public record ReservationBusyInterval(UUID employeeId, Instant startTime, Instant endTime) {
    public boolean overlaps(Instant start, Instant end) {
        return startTime.isBefore(end) && endTime.isAfter(start);
    }
}
