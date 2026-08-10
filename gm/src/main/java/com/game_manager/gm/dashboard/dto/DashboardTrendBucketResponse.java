package com.game_manager.gm.dashboard.dto;
import java.math.BigDecimal;
import java.time.LocalDate;
public record DashboardTrendBucketResponse(LocalDate date, BigDecimal completedRevenue, long completedOrders, long reservations) {}
