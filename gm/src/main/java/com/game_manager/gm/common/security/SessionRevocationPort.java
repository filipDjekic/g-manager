package com.game_manager.gm.common.security;

import java.util.UUID;

public interface SessionRevocationPort {
    void revokeAllSessions(UUID userId);
}
