package com.game_manager.gm.notification.dto;
import com.game_manager.gm.notification.*; import java.time.Instant; import java.util.UUID;
public record NotificationResponse(UUID id,NotificationType type,NotificationPriority priority,String title,String body,boolean read,Instant createdAt) {
 public static NotificationResponse from(Notification n){return new NotificationResponse(n.getId(),n.getType(),n.getPriority(),n.getTitle(),n.getBody(),n.getReadAt()!=null,n.getCreatedAt());}
}
