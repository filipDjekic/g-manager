package com.game_manager.gm.dashboard.dto;
import java.math.BigDecimal;
public record DashboardWidgetPreferenceResponse(String widgetKey, int position, boolean visible, BigDecimal threshold) {}
