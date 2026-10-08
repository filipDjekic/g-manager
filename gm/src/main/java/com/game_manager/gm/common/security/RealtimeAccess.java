package com.game_manager.gm.common.security;

import java.time.Instant;

public interface RealtimeAccess {
    Subscription capture(Permission permission);
    boolean isValid(Subscription subscription, Permission permission);
    record Subscription(AuthenticatedUser actor, Instant expiresAt) {}
}