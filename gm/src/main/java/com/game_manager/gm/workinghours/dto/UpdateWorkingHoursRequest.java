package com.game_manager.gm.workinghours.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalTime;

public record UpdateWorkingHoursRequest(
        @NotNull LocalTime openTime,
        @NotNull LocalTime closeTime,
        boolean active,
        @PositiveOrZero Long version
) {
}
