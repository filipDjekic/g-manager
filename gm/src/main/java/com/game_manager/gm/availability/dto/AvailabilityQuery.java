package com.game_manager.gm.availability.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;

public record AvailabilityQuery(
        @NotNull UUID serviceId,
        UUID employeeId,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        UUID resourceId,
        UUID locationId,
        UUID areaId,
        @jakarta.validation.constraints.Min(1) Integer durationMinutes
) {
    public AvailabilityQuery(UUID serviceId,UUID employeeId,LocalDate from,LocalDate to,UUID resourceId,UUID locationId) {
        this(serviceId,employeeId,from,to,resourceId,locationId,null,null);
    }
    public AvailabilityQuery(UUID serviceId,UUID employeeId,LocalDate from,LocalDate to,UUID resourceId) {
        this(serviceId,employeeId,from,to,resourceId,null);
    }
}
