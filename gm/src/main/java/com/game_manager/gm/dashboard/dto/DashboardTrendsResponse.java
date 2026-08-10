package com.game_manager.gm.dashboard.dto;
import com.game_manager.gm.reservation.ReservationStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
public record DashboardTrendsResponse(LocalDate from, LocalDate to, LocalDate previousFrom, LocalDate previousTo,
        String timezone, String grain, DashboardMetricResponse revenue, DashboardMetricResponse completedOrders,
        DashboardMetricResponse reservations, Map<ReservationStatus, Long> reservationsByStatus,
        List<DashboardTrendBucketResponse> buckets) {}
