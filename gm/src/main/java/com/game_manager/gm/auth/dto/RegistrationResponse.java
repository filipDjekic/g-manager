package com.game_manager.gm.auth.dto;

import com.game_manager.gm.user.Role;

import java.util.UUID;

public record RegistrationResponse(UUID id, String name, String email, Role role) {
}
