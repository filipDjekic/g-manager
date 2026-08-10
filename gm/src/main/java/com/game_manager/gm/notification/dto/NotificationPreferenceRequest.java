package com.game_manager.gm.notification.dto;
import com.game_manager.gm.notification.NotificationType; import jakarta.validation.constraints.NotNull;
public record NotificationPreferenceRequest(@NotNull NotificationType type,boolean inAppEnabled,boolean emailEnabled) {}
