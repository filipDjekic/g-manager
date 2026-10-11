package com.game_manager.gm.order.dto;

import java.time.LocalDate;

public record OrderStatisticsResponse(long total, long completed, long inProgress, long cancelled,
        LocalDate from, LocalDate to, String timeZone) {
}
