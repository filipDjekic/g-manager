package com.game_manager.gm.order.dto;

import com.game_manager.gm.order.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderManagementResponse(UUID id, UUID customerId, UUID handledBy,
        OrderStatus status, BigDecimal totalPrice, List<OrderManagementItemResponse> items,
        Instant createdAt, Instant updatedAt, Long version, String customerName, String handledByName) {
}
