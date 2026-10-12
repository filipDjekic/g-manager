package com.game_manager.gm.waitlist.dto;

import com.game_manager.gm.waitlist.*;
import java.time.Instant;
import java.util.*;

public record WaitlistOperationalResponse(UUID id, UUID customerId, String customerName,
        UUID employeeId, String employeeName, UUID serviceId, String serviceName,
        UUID locationId, String locationName, UUID resourceId, String resourceName,
        Instant createdAt, Instant desiredStart, Instant desiredEnd, WaitlistStatus status,
        UUID offerId, Instant offerExpiresAt, WaitlistOfferStatus offerStatus, String resourceCode,
        Long version, Instant serverTime, boolean stationManageable, boolean readOnly,
        String customerEmail, boolean customerActive, Integer durationMinutes, String resourceType,
        UUID areaId, String areaName, Instant queueEnteredAt, String internalNote,
        UUID createdById, String createdByName, Instant consentAt, Instant offerCreatedAt,
        UUID offeredResourceId, String offeredResourceName, UUID reservationId, Set<String> allowedActions) {}
