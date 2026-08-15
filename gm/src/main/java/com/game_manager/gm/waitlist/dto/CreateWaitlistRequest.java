package com.game_manager.gm.waitlist.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CreateWaitlistRequest(@NotNull UUID serviceId, @NotNull UUID employeeId,
                                    UUID resourceId, @NotNull Instant desiredStart) {
    public CreateWaitlistRequest(UUID serviceId, UUID employeeId, Instant desiredStart) {
        this(serviceId, employeeId, null, desiredStart);
    }
}
