package com.game_manager.gm.user.dto;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import com.game_manager.gm.user.User;

import java.time.Instant;
import java.util.UUID;
import java.util.Set;

public record UserResponse(
        UUID id, String name, String email, Role role, boolean active,
        String avatarUrl, Instant createdAt, Instant updatedAt, Long version,
        Set<Permission> permissions
) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.isActive(),
                user.getAvatarUrl(), user.getCreatedAt(), user.getUpdatedAt(), user.getVersion(),
                RolePermissions.forRole(user.getRole()));
    }
}
