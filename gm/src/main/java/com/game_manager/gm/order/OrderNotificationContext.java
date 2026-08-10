package com.game_manager.gm.order; import java.util.UUID;
public record OrderNotificationContext(UUID customerId,UUID handledBy,OrderStatus status) {}
