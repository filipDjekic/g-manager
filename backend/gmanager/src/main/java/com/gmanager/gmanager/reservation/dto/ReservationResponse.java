package com.gmanager.gmanager.reservation.dto;

import com.gmanager.gmanager.reservation.domain.ReservationStatus;

import java.time.Instant;

public record ReservationResponse(
        Long id,
        Long customerId,
        String customerName,
        Long employeeId,
        String employeeName,
        Long serviceId,
        String serviceName,
        Instant startTime,
        Instant endTime,
        ReservationStatus status,
        String note,
        Instant createdAt,
        Instant updatedAt
) {
}