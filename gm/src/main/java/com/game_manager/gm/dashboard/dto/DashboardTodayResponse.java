package com.game_manager.gm.dashboard.dto;

public record DashboardTodayResponse(
        long pendingReservationsToMe,
        long confirmedTodayCount,
        long unclaimedOrdersCount,
        long myInProgressOrdersCount) {}
