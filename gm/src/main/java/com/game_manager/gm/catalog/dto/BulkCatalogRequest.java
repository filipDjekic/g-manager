package com.game_manager.gm.catalog.dto;

import com.game_manager.gm.common.dto.BulkItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BulkCatalogRequest(@NotNull Action action,
        @NotEmpty @Size(max = 100) List<@Valid BulkItem> items) {
    public enum Action { ACTIVATE, DEACTIVATE }
}
