package com.game_manager.gm.feature;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record UpdateFeatureFlagRequest(
        @NotNull Boolean enabled,
        @Min(0) @Max(100) int rolloutPercentage,
        @Future Instant expiresAt,
        @NotBlank @Size(max = 500) String reason,
        Long version
) {
}
