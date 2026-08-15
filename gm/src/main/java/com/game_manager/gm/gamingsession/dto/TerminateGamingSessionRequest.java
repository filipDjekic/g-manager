package com.game_manager.gm.gamingsession.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TerminateGamingSessionRequest(
        @NotBlank @Size(max = 500) String reason,
        @NotNull Long version
) {}
