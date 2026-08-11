package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.ReservationStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ReservationDetailResponse(
        UUID id,
        String customerName,
        String customerContact,
        String employeeName,
        String serviceName,
        Integer durationMinutes,
        Instant startTime,
        Instant endTime,
        ReservationStatus status,
        String note,
        Instant createdAt,
        Instant updatedAt,
        Long version,
        List<ReservationStatus> allowedActions,
        List<ReservationHistoryResponse> history
) {}
