package com.game_manager.gm.dashboard.dto;
import java.math.BigDecimal;
import java.util.UUID;
public record DashboardWorkloadItemResponse(UUID employeeId, String employeeName, long reservationCount,
        long reservedMinutes, long capacityMinutes, BigDecimal utilizationPercent) {}
