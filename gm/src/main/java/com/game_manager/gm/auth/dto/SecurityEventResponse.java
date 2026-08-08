package com.game_manager.gm.auth.dto;

import com.game_manager.gm.auth.SecurityEventType;

import java.time.Instant;

public record SecurityEventResponse(
        SecurityEventType type,
        String deviceLabel,
        Instant occurredAt
) {
}
