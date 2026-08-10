package com.game_manager.gm.order.dto;

import com.game_manager.gm.common.dto.BulkItem;
import com.game_manager.gm.order.OrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BulkOrderStatusRequest(@NotNull OrderStatus status,
        @NotEmpty @Size(max = 100) List<@Valid BulkItem> items) {}
