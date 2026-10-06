package com.game_manager.gm.waitlist.dto;

import com.game_manager.gm.waitlist.WaitlistStatus;
import java.time.Instant;
import java.util.UUID;

public record WaitlistOperationalResponse(UUID id, UUID customerId, String customerName,
        UUID employeeId, String employeeName, UUID serviceId, String serviceName,
        UUID locationId, String locationName, UUID resourceId, String resourceName,
        Instant createdAt, Instant desiredStart, Instant desiredEnd, WaitlistStatus status,
        UUID offerId, Instant offerExpiresAt) {}
