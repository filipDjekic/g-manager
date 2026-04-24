package com.gmanager.gmanager_backend.user.dto;
import com.gmanager.gmanager_backend.user.Role;
import jakarta.validation.constraints.*;
public record UpdateUserRequest(@NotBlank @Size(min=2,max=100) String name, @NotBlank @Email @Size(max=180) String email, @NotNull Role role) {}
