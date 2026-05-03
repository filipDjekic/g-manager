package com.gmanager.gmanager.user.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateUserStatusRequest(

        @NotNull(message = "Active is required")
        Boolean active
) {
}