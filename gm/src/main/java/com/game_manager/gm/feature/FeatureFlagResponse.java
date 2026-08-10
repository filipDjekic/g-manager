package com.game_manager.gm.feature;

import java.time.Instant;
import java.time.LocalDate;

public record FeatureFlagResponse(
        String key,
        boolean enabled,
        int rolloutPercentage,
        String owner,
        LocalDate reviewBy,
        boolean overridden,
        Instant overrideExpiresAt,
        Long version
) {
}
