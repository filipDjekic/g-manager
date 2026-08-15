package com.game_manager.gm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ActivateCustomerRequest(
        @NotBlank @Size(max = 100) String activationSecret,
        @NotBlank @Size(min = 8, max = 100) String password
) {
}
