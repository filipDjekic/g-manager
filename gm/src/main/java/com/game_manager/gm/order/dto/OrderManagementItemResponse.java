package com.game_manager.gm.order.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderManagementItemResponse(UUID productId, Integer quantity,
        BigDecimal unitPrice, BigDecimal lineTotal, String productName, String productImageUrl) {
}
