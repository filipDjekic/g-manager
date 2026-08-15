package com.game_manager.gm.gamingsession.realtime;

import java.time.Instant;
import java.util.UUID;

public record GamingSessionEvent(UUID eventId, String type, UUID sessionId, Instant occurredAt) {}
