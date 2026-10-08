package com.game_manager.gm.waitlist.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CreateWaitlistRequest(@NotNull UUID serviceId, @NotNull UUID employeeId,
                                    UUID resourceId, @NotNull Instant desiredStart, UUID locationId) {
    public CreateWaitlistRequest(UUID serviceId, UUID employeeId, UUID resourceId, Instant desiredStart) {
        this(serviceId, employeeId, resourceId, desiredStart, null);
    }
    public CreateWaitlistRequest(UUID serviceId, UUID employeeId, Instant desiredStart) {
        this(serviceId, employeeId, null, desiredStart, null);
    }
}
