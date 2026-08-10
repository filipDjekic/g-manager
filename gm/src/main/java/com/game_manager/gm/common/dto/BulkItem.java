package com.game_manager.gm.common.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.UUID;

public record BulkItem(@NotNull UUID id, @NotNull @PositiveOrZero Long version) {}
