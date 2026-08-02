package com.game_manager.gm.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateOrderRequest(
        @NotEmpty @Size(max = 100) List<@Valid OrderItemRequest> items) {}
