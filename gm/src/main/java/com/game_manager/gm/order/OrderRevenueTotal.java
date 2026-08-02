package com.game_manager.gm.order;

import java.math.BigDecimal;

public record OrderRevenueTotal(long completedOrdersCount, BigDecimal totalRevenueCompleted) {}
