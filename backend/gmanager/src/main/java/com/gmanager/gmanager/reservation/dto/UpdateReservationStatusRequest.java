package com.gmanager.gmanager.reservation.dto;

import com.gmanager.gmanager.reservation.domain.ReservationStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateReservationStatusRequest(

        @NotNull(message = "Status is required")
        ReservationStatus status
) {
}