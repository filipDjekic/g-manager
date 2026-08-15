package com.game_manager.gm.gamingsession.dto;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record StartGamingSessionRequest(
        @NotNull UUID customerId,
        @NotNull UUID resourceId,
        UUID reservationId,
        @Positive Integer durationMinutes
) {}
