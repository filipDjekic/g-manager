package com.game_manager.gm.workinghours.dto;

import com.game_manager.gm.workinghours.WorkingHours;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

public record WorkingHoursResponse(
        UUID id,
        UUID locationId,
        DayOfWeek dayOfWeek,
        LocalTime openTime,
        LocalTime closeTime,
        boolean active,
        boolean spansMidnight,
        Long version
) {
    public static WorkingHoursResponse from(WorkingHours hours) {
        return new WorkingHoursResponse(
                hours.getId(), hours.getLocationId(), hours.getDayOfWeek(), hours.getOpenTime(), hours.getCloseTime(),
                hours.isActive(), hours.spansMidnight(), hours.getVersion());
    }
}
