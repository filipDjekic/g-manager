package com.game_manager.gm.auth.dto;

import com.game_manager.gm.user.Role;
import com.game_manager.gm.user.User;

import java.util.UUID;

public record UserSummary(UUID id, String name, String email, Role role, boolean active) {
    public static UserSummary from(User user) {
        return new UserSummary(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.isActive());
    }
}
