package com.game_manager.gm.dashboard.dto;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
public record DashboardWidgetPreferenceRequest(@NotBlank @Size(max = 50) String widgetKey,
        @Min(0) @Max(20) int position, boolean visible, @DecimalMin("0.0") BigDecimal threshold) {}
