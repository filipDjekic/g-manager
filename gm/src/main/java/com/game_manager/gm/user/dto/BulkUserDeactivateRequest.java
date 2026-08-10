package com.game_manager.gm.user.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record BulkUserDeactivateRequest(@NotEmpty @Size(max = 100) List<@NotNull UUID> ids) {}
