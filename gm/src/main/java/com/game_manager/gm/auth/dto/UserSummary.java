package com.game_manager.gm.auth.dto;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import com.game_manager.gm.user.User;

import java.util.UUID;
import java.util.Set;

public record UserSummary(
        UUID id, String name, String email, Role role, boolean active,
        Set<Permission> permissions) {
    public static UserSummary from(User user) {
        return new UserSummary(user.getId(), user.getName(), user.getEmail(), user.getRole(),
                user.isActive(), RolePermissions.forRole(user.getRole()));
    }
}
