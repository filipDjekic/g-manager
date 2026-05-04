package com.gmanager.gmanager.reservation.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record CreateReservationRequest(

        @NotNull(message = "Employee id is required")
        Long employeeId,

        @NotNull(message = "Service id is required")
        Long serviceId,

        @NotNull(message = "Start time is required")
        @Future(message = "Start time must be in the future")
        Instant startTime,

        @Size(max = 1000, message = "Note must not exceed 1000 characters")
        String note
) {
}