package com.gmanager.gmanager.user.dto;

import com.gmanager.gmanager.user.domain.UserRole;
import jakarta.validation.constraints.NotNull;

public record UpdateUserRoleRequest(

        @NotNull(message = "Role is required")
        UserRole role
) {
}