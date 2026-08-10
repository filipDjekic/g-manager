package com.game_manager.gm.search.dto;

import com.game_manager.gm.common.search.SearchResourceType;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SearchPreferenceRequest(@NotNull SearchResourceType type, @NotNull UUID id, boolean favorite) {}
