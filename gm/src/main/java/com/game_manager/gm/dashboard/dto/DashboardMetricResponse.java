package com.game_manager.gm.dashboard.dto;
import java.math.BigDecimal;
public record DashboardMetricResponse(BigDecimal current, BigDecimal previous, BigDecimal absoluteChange, BigDecimal percentChange) {}
