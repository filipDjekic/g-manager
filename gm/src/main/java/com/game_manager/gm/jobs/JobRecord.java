package com.game_manager.gm.jobs;

import java.time.Instant;
import java.util.UUID;

public record JobRecord(
        UUID id,
        String type,
        String payload,
        String correlationId,
        int attempt,
        int maxAttempts,
        long timeoutSeconds,
        UUID leaseToken,
        Instant leaseExpiresAt
) {
}
