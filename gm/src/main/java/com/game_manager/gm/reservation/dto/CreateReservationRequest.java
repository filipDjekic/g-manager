package com.game_manager.gm.reservation.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record CreateReservationRequest(
        UUID employeeId,
        @NotNull UUID serviceId,
        @NotNull Instant startTime,
        @Size(max = 500) String note
) {
}
