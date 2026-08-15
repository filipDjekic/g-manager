package com.game_manager.gm.gamingsession.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record ExtendGamingSessionRequest(@Positive int minutes, @NotNull Long version) {}
