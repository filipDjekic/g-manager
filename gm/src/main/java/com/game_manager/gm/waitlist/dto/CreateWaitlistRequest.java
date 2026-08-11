package com.game_manager.gm.waitlist.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CreateWaitlistRequest(@NotNull UUID serviceId, @NotNull UUID employeeId,
                                    @NotNull Instant desiredStart) {}
