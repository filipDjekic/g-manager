package com.game_manager.gm.notification;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.util.UUID;
import lombok.Getter; import lombok.NoArgsConstructor; import lombok.Setter; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="notification_preferences", uniqueConstraints=@UniqueConstraint(name="uk_notification_preference_recipient_type",columnNames={"recipient_id","type"}))
@Getter @Setter @NoArgsConstructor public class NotificationPreference extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="recipient_id",nullable=false,length=36) private UUID recipientId;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=80) private NotificationType type;
 @Column(name="in_app_enabled",nullable=false) private boolean inAppEnabled=true;
 @Column(name="email_enabled",nullable=false) private boolean emailEnabled;
}
