package com.game_manager.gm.order.dto;

import com.game_manager.gm.order.OrderStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateOrderStatusRequest(
        @NotNull OrderStatus status,
        @NotNull Long version) {}
