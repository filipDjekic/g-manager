package com.game_manager.gm.user.dto;

import com.game_manager.gm.user.Role;
import com.game_manager.gm.user.User;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
        UUID id, String name, String email, Role role, boolean active,
        String avatarUrl, Instant createdAt, Instant updatedAt, Long version
) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.isActive(),
                user.getAvatarUrl(), user.getCreatedAt(), user.getUpdatedAt(), user.getVersion());
    }
}
