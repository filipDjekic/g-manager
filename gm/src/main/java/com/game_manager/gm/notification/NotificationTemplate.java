package com.game_manager.gm.notification;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*;
import lombok.Getter; import lombok.NoArgsConstructor; import lombok.Setter;
@Entity @Table(name="notification_templates",uniqueConstraints=@UniqueConstraint(name="uk_notification_template_type_locale",columnNames={"type","locale"}))
@Getter @Setter @NoArgsConstructor public class NotificationTemplate extends BaseEntity {
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=80) private NotificationType type;
 @Column(nullable=false,length=10) private String locale; @Column(name="title_template",nullable=false,length=180) private String titleTemplate;
 @Column(name="body_template",nullable=false,length=1000) private String bodyTemplate;
}
