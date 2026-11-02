package com.game_manager.gm.common.security;

import java.util.UUID;

public interface SecurityEventPort {
    void recordActivationSuccess(UUID userId, String ipHash);
}
