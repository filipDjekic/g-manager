package com.game_manager.gm.order.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Max;
import java.util.UUID;

public record OrderItemRequest(
        @NotNull UUID productId,
        @NotNull @Positive @Max(999) Integer quantity) {}
