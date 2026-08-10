package com.game_manager.gm.reservation; import java.util.UUID;
public record ReservationNotificationContext(UUID customerId,UUID employeeId,ReservationStatus status) {}
