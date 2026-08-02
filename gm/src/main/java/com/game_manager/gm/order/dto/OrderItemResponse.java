package com.game_manager.gm.order.dto;

import com.game_manager.gm.order.OrderItem;
import java.math.BigDecimal;
import java.util.UUID;

public record OrderItemResponse(
        UUID productId,
        Integer quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal) {
    public static OrderItemResponse from(OrderItem item) {
        return new OrderItemResponse(
                item.getProductId(), item.getQuantity(), item.getUnitPrice(), item.getLineTotal());
    }
}
