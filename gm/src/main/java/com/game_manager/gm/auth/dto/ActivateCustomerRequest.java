package com.game_manager.gm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

public record ActivateCustomerRequest(
        @NotBlank @Email @Size(max = 180) String email,
        @Schema(minLength = 4, maxLength = 4, pattern = "[A-Z0-9]{4}")
        String activationSecret,
        @NotBlank @Size(min = 8, max = 100) String password
) {
    @Override
    public String toString() {
        return "ActivateCustomerRequest[REDACTED]";
    }
}
