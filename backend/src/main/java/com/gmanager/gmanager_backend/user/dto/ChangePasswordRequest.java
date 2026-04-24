package com.gmanager.gmanager_backend.user.dto;
import jakarta.validation.constraints.*;
public record ChangePasswordRequest(String currentPassword, @NotBlank @Size(min=8,max=100) String newPassword) {}
