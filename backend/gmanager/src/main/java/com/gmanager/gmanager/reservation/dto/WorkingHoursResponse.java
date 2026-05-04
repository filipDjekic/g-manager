package com.gmanager.gmanager.reservation.dto;

import java.time.LocalTime;

public record WorkingHoursResponse(
        Long id,
        Integer dayOfWeek,
        LocalTime openTime,
        LocalTime closeTime,
        boolean active
) {
}