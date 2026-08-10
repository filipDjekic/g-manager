package com.game_manager.gm.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record OrderAnalyticsRow(UUID id, Instant createdAt, OrderStatus status, BigDecimal totalPrice) {}
