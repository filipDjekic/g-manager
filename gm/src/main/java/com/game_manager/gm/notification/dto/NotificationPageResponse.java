package com.game_manager.gm.notification.dto;
import java.util.List; public record NotificationPageResponse(List<NotificationResponse> notifications,long unreadCount) {}
