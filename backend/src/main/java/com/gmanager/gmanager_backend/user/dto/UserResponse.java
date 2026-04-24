package com.gmanager.gmanager_backend.user.dto;
import com.gmanager.gmanager_backend.user.Role;
import java.time.Instant;
public record UserResponse(Long id, String name, String email, Role role, boolean active, Long organizationId, String organizationName, Instant createdAt, Instant updatedAt) {}
