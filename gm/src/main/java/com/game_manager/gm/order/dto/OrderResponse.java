package com.game_manager.gm.order.dto;

import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID id,
        UUID customerId,
        UUID handledBy,
        OrderStatus status,
        BigDecimal totalPrice,
        List<OrderItemResponse> items,
        Instant createdAt,
        Instant updatedAt,
        Long version) {
    public static OrderResponse from(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getCustomerId(),
                order.getHandledBy(),
                order.getStatus(),
                order.getTotalPrice(),
                order.getItems().stream().map(OrderItemResponse::from).toList(),
                order.getCreatedAt(),
                order.getUpdatedAt(),
                order.getVersion());
    }
}
