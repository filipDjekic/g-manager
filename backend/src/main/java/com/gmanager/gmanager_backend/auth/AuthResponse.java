package com.gmanager.gmanager_backend.auth;

import com.gmanager.gmanager_backend.user.Role;

public record AuthResponse(String token, UserResponse user) {
    public record UserResponse(Long id, String name, String email, Role role) {}
}
