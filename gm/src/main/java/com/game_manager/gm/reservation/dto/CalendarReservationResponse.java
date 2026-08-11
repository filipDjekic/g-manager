package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.ReservationStatus;
import java.time.Instant;
import java.util.UUID;
import java.util.List;

public record CalendarReservationResponse(
        UUID id,
        UUID employeeId,
        String employeeName,
        String customerName,
        String serviceName,
        Instant startTime,
        Instant endTime,
        ReservationStatus status,
        Long version,
        List<ReservationStatus> allowedActions) {
}
