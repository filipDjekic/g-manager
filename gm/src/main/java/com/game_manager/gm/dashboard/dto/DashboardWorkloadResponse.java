package com.game_manager.gm.dashboard.dto;
import java.time.LocalDate;
import java.util.List;
public record DashboardWorkloadResponse(LocalDate from, LocalDate to, String timezone,
        String capacityDefinition, List<DashboardWorkloadItemResponse> employees) {}
