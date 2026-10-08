package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationStatus;
import java.time.Instant;
import java.util.UUID;

public record ReservationResponse(
        UUID id,
        UUID customerId,
        UUID employeeId,
        UUID serviceId,
        UUID locationId,
        UUID resourceId,
        UUID recurrenceSeriesId,
        Instant startTime,
        Instant endTime,
        ReservationStatus status,
        String note,
        Instant createdAt,
        Instant updatedAt,
        Long version,
        String resourceCode,
        String resourceName,
        String locationName,
        boolean resourceRequired,
        String serviceName, String customerName, String employeeName,
        boolean canManage, boolean readOnly, boolean canEdit,
        java.util.List<ReservationStatus> allowedActions
) {
    public static ReservationResponse from(Reservation reservation) {
        return from(reservation, null, null, false);
    }

    public static ReservationResponse from(Reservation reservation,
            com.game_manager.gm.resource.dto.BookingResourceView resource, String locationName, boolean required) {
        return from(reservation,resource,locationName,required,null,null,null,false,false,false,java.util.List.of());
    }

    public static ReservationResponse from(Reservation reservation,
            com.game_manager.gm.resource.dto.BookingResourceView resource, String locationName, boolean required,
            String serviceName,String customerName,String employeeName,boolean canManage,boolean readOnly,
            boolean canEdit,java.util.List<ReservationStatus> actions) {
        return new ReservationResponse(
                reservation.getId(), readOnly ? null : reservation.getCustomerId(), reservation.getEmployeeId(),
                reservation.getServiceId(), reservation.getLocationId(), reservation.getResourceId(), reservation.getRecurrenceSeriesId(), reservation.getStartTime(), reservation.getEndTime(),
                reservation.getStatus(), readOnly ? null : reservation.getNote(), reservation.getCreatedAt(),
                reservation.getUpdatedAt(), reservation.getVersion(), resource == null ? null : resource.code(),
                resource == null ? null : resource.name(), locationName, required,serviceName,customerName,employeeName,canManage,readOnly,canEdit,actions);
    }
}
