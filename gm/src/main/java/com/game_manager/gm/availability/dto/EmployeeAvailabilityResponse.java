package com.game_manager.gm.availability.dto;

import java.util.List;
import java.util.UUID;

public record EmployeeAvailabilityResponse(
        UUID employeeId, String employeeName, List<AvailabilitySlotResponse> slots) {}
