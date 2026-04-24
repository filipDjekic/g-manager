package com.gmanager.gmanager_backend.organization.dto;

import java.time.Instant;

public record OrganizationResponse(
        Long id,
        String name,
        String address,
        String phone,
        Long ownerId,
        String ownerName,
        Instant createdAt,
        Instant updatedAt
) {}
