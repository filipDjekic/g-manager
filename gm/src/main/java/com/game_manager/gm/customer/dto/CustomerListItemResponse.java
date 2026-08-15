package com.game_manager.gm.customer.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record CustomerListItemResponse(
        UUID id, String name, String email, boolean active, Instant registeredAt,
        long reservationCount, long completedAppointmentCount,
        long orderCount, long completedOrderCount, BigDecimal completedOrderRevenue,
        Instant lastActivityAt, long version) {}
