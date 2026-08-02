package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.ReservationStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record ChangeReservationStatusRequest(
        @NotNull ReservationStatus status,
        @Size(max = 500) String note,
        @NotNull @PositiveOrZero Long version
) {
}
