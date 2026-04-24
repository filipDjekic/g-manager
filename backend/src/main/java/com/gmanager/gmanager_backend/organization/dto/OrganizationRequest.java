package com.gmanager.gmanager_backend.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record OrganizationRequest(
        @NotBlank @Size(min = 2, max = 120) String name,
        @NotBlank @Size(min = 2, max = 255) String address,
        @NotBlank @Size(min = 3, max = 40) String phone
) {}
