package com.game_manager.gm.reservation.dto;

import java.time.LocalDate;

public record ReservationSummaryResponse(
        long todayReservations,
        long upcomingReservations,
        long uniqueCustomers,
        long cancelledTodayAppointments,
        LocalDate today,
        LocalDate upcomingThrough,
        LocalDate customersFrom,
        LocalDate customersTo,
        String timezone) {
}
