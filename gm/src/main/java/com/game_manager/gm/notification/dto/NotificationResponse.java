package com.game_manager.gm.notification.dto;
import com.game_manager.gm.common.web.NavigationActionResponse; import com.game_manager.gm.notification.*; import java.time.Instant; import java.util.UUID;
public record NotificationResponse(UUID id,NotificationType type,NotificationPriority priority,String title,String body,boolean read,Instant createdAt,NavigationActionResponse action) {
 public static NotificationResponse from(Notification n){return from(n,null);}
 public static NotificationResponse from(Notification n,NavigationActionResponse action){return new NotificationResponse(n.getId(),n.getType(),n.getPriority(),n.getTitle(),n.getBody(),n.getReadAt()!=null,n.getCreatedAt(),action);}
}
