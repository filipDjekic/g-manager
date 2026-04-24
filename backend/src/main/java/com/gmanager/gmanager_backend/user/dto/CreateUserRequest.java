package com.gmanager.gmanager_backend.user.dto;
import com.gmanager.gmanager_backend.user.Role;
import jakarta.validation.constraints.*;
public record CreateUserRequest(@NotBlank @Size(min=2,max=100) String name, @NotBlank @Email @Size(max=180) String email, @NotBlank @Size(min=8,max=100) String password, @NotNull Role role) {}
