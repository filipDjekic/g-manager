package com.game_manager.gm.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        String deviceLabel,
        String userAgentSummary,
        Instant createdAt,
        Instant lastSeenAt,
        Instant expiresAt,
        boolean current
) {
}
