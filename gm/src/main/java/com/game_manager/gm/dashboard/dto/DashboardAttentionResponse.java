package com.game_manager.gm.dashboard.dto;

import java.time.LocalDate;
import java.util.List;

public record DashboardAttentionResponse(
        LocalDate date,
        String timezone,
        int workloadThresholdPercent,
        List<AttentionItem> items) {
    public record AttentionItem(
            String key,
            String label,
            String detail,
            long count,
            String severity,
            String url) {}
}
