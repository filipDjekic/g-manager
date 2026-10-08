package com.game_manager.gm.reservation.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record AssignReservationResourceRequest(@NotNull UUID resourceId, @NotNull Long version) {}
