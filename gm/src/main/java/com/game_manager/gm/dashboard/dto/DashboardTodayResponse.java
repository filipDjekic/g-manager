package com.game_manager.gm.dashboard.dto;

import com.game_manager.gm.notification.dto.NotificationResponse;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.ReservationStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record DashboardTodayResponse(
        LocalDate date,
        String timezone,
        Instant workingDayStart,
        Instant workingDayEnd,
        List<TodayAppointment> appointments,
        List<TodayGap> gaps,
        List<TodayOrder> unclaimedOrders,
        List<TodayOrder> assignedOrders,
        List<NotificationResponse> attentionNotifications) {
    public record TodayAppointment(UUID id, String customerName, String serviceName,
            Instant startTime, Instant endTime, ReservationStatus status,
            Long version, List<ReservationStatus> allowedActions) {}
    public record TodayGap(Instant startTime, Instant endTime) {}
    public record TodayOrder(UUID id, OrderStatus status, BigDecimal totalPrice,
            Instant createdAt, Long version, List<OrderStatus> allowedActions) {}
}
