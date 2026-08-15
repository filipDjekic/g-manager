package com.game_manager.gm.reservation.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record CreateReservationRequest(
        UUID employeeId,
        @NotNull UUID serviceId,
        UUID resourceId,
        @NotNull Instant startTime,
        @Size(max = 500) String note
) {
    public CreateReservationRequest(UUID employeeId, UUID serviceId, Instant startTime, String note) {
        this(employeeId, serviceId, null, startTime, note);
    }
}
