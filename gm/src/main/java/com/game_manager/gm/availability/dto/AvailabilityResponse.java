package com.game_manager.gm.availability.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AvailabilityResponse(
        String timezone,
        UUID serviceId,
        String serviceName,
        int durationMinutes,
        int slotIncrementMinutes,
        LocalDate from,
        LocalDate to,
        List<EmployeeAvailabilityResponse> employees
) {}
