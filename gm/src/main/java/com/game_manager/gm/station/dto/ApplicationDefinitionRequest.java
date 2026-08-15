package com.game_manager.gm.station.dto;

import com.game_manager.gm.station.ApplicationType;
import jakarta.validation.constraints.*;

public record ApplicationDefinitionRequest(
        @NotBlank @Size(max = 60) String code,
        @NotBlank @Size(max = 120) String name,
        @NotNull ApplicationType type,
        @NotBlank @Size(max = 500) String executablePath,
        @Size(max = 255) String publisher,
        @Pattern(regexp = "(?i)^[0-9a-f]{64}$") String executableSha256,
        @Size(max = 1000) String defaultArguments,
        boolean active,
        Long version
) {}
