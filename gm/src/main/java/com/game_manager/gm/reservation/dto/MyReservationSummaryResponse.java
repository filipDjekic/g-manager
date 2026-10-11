package com.game_manager.gm.reservation.dto;

import java.time.Instant;
import java.time.LocalDate;

public record MyReservationSummaryResponse(long upcomingReservations, long todayReservations,
        long completedReservations, LocalDate today, String timezone, Instant serverTime,
        long nextSevenDaysReservations) {}
