package com.game_manager.gm.waitlist.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;

public record ManageWaitlistRequest(UUID customerId, @NotNull UUID serviceId, @NotNull UUID employeeId,
        UUID locationId, UUID areaId, UUID resourceId, @NotNull Instant desiredStart,
        @Size(max=500) String internalNote, Boolean customerConsent, @Min(0) Long version) {}
