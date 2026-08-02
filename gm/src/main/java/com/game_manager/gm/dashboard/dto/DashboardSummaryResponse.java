package com.game_manager.gm.dashboard.dto;

import com.game_manager.gm.reservation.ReservationStatus;
import java.math.BigDecimal;
import java.util.Map;

public record DashboardSummaryResponse(
        BigDecimal totalRevenueCompleted,
        long completedOrdersCount,
        Map<ReservationStatus, Long> reservationsByStatus) {}
