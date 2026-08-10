package com.game_manager.gm.savedview.dto;

import com.game_manager.gm.savedview.SavedViewResourceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record SavedViewRequest(
        @NotNull SavedViewResourceType resourceType,
        @NotBlank @Size(max = 80) String name,
        @NotNull @Size(max = 30) Map<@Size(max = 64) String, @Size(max = 500) String> query,
        Long version
) {}
