package com.game_manager.gm.audit;

import java.time.Instant;

public record AuditStatusTransitionItem(
        String fromStatus, String toStatus, String reason, Instant occurredAt) {}
