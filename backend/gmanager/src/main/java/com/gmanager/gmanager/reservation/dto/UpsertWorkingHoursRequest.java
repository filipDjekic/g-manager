package com.gmanager.gmanager.reservation.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

public record UpsertWorkingHoursRequest(

        @NotNull(message = "Day of week is required")
        @Min(value = 1, message = "Day of week must be between 1 and 7")
        @Max(value = 7, message = "Day of week must be between 1 and 7")
        Integer dayOfWeek,

        @NotNull(message = "Open time is required")
        LocalTime openTime,

        @NotNull(message = "Close time is required")
        LocalTime closeTime,

        @NotNull(message = "Active is required")
        Boolean active
) {
}