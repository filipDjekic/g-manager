package com.game_manager.gm.notification;
import com.game_manager.gm.common.entity.BaseEntity;
import com.game_manager.gm.common.search.SearchResourceType;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter; import lombok.NoArgsConstructor; import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="notifications", uniqueConstraints=@UniqueConstraint(name="uk_notification_event_recipient_type", columnNames={"source_event_id","recipient_id","type"}))
@Getter @Setter @NoArgsConstructor
public class Notification extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="source_event_id",nullable=false,length=36) private UUID sourceEventId;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="recipient_id",nullable=false,length=36) private UUID recipientId;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=80) private NotificationType type;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private NotificationPriority priority;
 @Column(nullable=false,length=180) private String title; @Column(nullable=false,length=1000) private String body;
 @Enumerated(EnumType.STRING) @Column(name="resource_type",length=30) private SearchResourceType resourceType;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="resource_id",length=36) private UUID resourceId;
 @Column(name="deep_link",nullable=false,length=500) private String deepLink;
 @Column(name="in_app_visible",nullable=false) private boolean inAppVisible=true;
 @Column(name="read_at") private Instant readAt;
}
