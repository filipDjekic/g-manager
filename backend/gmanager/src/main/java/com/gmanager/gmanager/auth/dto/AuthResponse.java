package com.gmanager.gmanager.auth.dto;

import com.gmanager.gmanager.user.domain.UserRole;

public record AuthResponse(
        String token,
        String tokenType,
        long expiresInMs,
        UserResponse user
) {
    public record UserResponse(
            Long id,
            String name,
            String email,
            UserRole role,
            boolean active
    ) {
    }
}