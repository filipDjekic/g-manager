package com.game_manager.gm.customer.dto;

import java.time.Instant;
import java.util.UUID;

public record CustomerOnboardingResponse(
        UUID id,
        String name,
        String email,
        boolean active,
        long version,
        String activationSecret,
        Instant activationExpiresAt
) {
}
