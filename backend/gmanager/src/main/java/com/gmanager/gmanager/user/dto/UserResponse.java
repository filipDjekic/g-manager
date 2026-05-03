package com.gmanager.gmanager.user.dto;

import com.gmanager.gmanager.user.domain.UserRole;

import java.time.Instant;

public record UserResponse(
        Long id,
        String name,
        String email,
        UserRole role,
        boolean active,
        Instant createdAt,
        Instant updatedAt
) {
}