package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.common.dto.BulkItem;
import com.game_manager.gm.reservation.ReservationStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BulkReservationStatusRequest(@NotNull ReservationStatus status,
        @Size(max = 500) String reason,
        @NotEmpty @Size(max = 100) List<@Valid BulkItem> items) {}
