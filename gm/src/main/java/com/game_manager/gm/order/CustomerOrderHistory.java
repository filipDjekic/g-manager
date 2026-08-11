package com.game_manager.gm.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record CustomerOrderHistory(UUID id, OrderStatus status, BigDecimal totalPrice, Instant createdAt) {}
