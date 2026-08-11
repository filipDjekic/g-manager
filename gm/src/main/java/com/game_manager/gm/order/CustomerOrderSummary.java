package com.game_manager.gm.order;

import java.math.BigDecimal;
import java.util.UUID;
import java.time.Instant;

public record CustomerOrderSummary(
        UUID customerId, long orderCount, long completedOrderCount, BigDecimal completedRevenue,
        Instant lastOrderAt) {}
