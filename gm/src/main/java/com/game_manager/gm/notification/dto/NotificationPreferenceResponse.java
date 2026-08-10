package com.game_manager.gm.notification.dto;
import com.game_manager.gm.notification.NotificationType;
public record NotificationPreferenceResponse(NotificationType type,boolean mandatory,boolean inAppEnabled,boolean emailEnabled) {}
