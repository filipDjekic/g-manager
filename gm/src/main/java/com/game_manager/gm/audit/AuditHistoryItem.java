package com.game_manager.gm.audit;

import java.time.Instant;

public record AuditHistoryItem(String action, Instant occurredAt) {}
