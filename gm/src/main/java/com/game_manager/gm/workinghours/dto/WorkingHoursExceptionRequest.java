package com.game_manager.gm.workinghours.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;

public record WorkingHoursExceptionRequest(
        @NotNull LocalDate date,
        @Size(max = 500) String description,
        boolean fullDayClosed,
        LocalTime overrideOpenTime,
        LocalTime overrideCloseTime,
        @PositiveOrZero Long version
) {
}
