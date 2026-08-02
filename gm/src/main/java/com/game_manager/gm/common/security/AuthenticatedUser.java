package com.game_manager.gm.common.security;

import java.util.UUID;

public record AuthenticatedUser(UUID id, String email, Role role) {
}
