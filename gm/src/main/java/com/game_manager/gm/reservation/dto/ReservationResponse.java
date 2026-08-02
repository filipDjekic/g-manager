package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationStatus;
import java.time.Instant;
import java.util.UUID;

public record ReservationResponse(
        UUID id,
        UUID customerId,
        UUID employeeId,
        UUID serviceId,
        Instant startTime,
        Instant endTime,
        ReservationStatus status,
        String note,
        Instant createdAt,
        Instant updatedAt,
        Long version
) {
    public static ReservationResponse from(Reservation reservation) {
        return new ReservationResponse(
                reservation.getId(), reservation.getCustomerId(), reservation.getEmployeeId(),
                reservation.getServiceId(), reservation.getStartTime(), reservation.getEndTime(),
                reservation.getStatus(), reservation.getNote(), reservation.getCreatedAt(),
                reservation.getUpdatedAt(), reservation.getVersion());
    }
}
