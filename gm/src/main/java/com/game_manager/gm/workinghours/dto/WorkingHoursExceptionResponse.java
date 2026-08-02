package com.game_manager.gm.workinghours.dto;

import com.game_manager.gm.workinghours.WorkingHoursException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record WorkingHoursExceptionResponse(
        UUID id,
        LocalDate date,
        String description,
        boolean fullDayClosed,
        LocalTime overrideOpenTime,
        LocalTime overrideCloseTime,
        Long version
) {
    public static WorkingHoursExceptionResponse from(WorkingHoursException exception) {
        return new WorkingHoursExceptionResponse(
                exception.getId(), exception.getDate(), exception.getDescription(),
                exception.isFullDayClosed(), exception.getOverrideOpenTime(),
                exception.getOverrideCloseTime(), exception.getVersion());
    }
}
