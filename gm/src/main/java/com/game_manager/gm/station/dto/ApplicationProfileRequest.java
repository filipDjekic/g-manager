package com.game_manager.gm.station.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record ApplicationProfileRequest(
        @NotBlank @Size(max = 60) String code,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 500) String description,
        boolean active,
        @NotNull List<@Valid Entry> entries,
        Long version
) {
    public record Entry(
            @NotNull UUID applicationDefinitionId,
            boolean requiredProcess,
            boolean autoStart,
            @PositiveOrZero int launchOrder,
            @Size(max = 1000) String argumentsOverride,
            @Pattern(regexp = "^[A-Za-z0-9_-]{1,60}$") String dependencyGroup
    ) {}
}
