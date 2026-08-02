package com.game_manager.gm.security;

import com.game_manager.gm.user.Role;

import java.util.UUID;

public record AuthenticatedUser(UUID id, String email, Role role) {
}
