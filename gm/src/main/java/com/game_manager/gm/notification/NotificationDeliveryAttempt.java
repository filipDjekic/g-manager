package com.game_manager.gm.notification;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.time.Instant;
import lombok.Getter; import lombok.NoArgsConstructor; import lombok.Setter;
@Entity @Table(name="notification_delivery_attempts",uniqueConstraints=@UniqueConstraint(name="uk_notification_delivery_channel",columnNames={"notification_id","channel"}))
@Getter @Setter @NoArgsConstructor public class NotificationDeliveryAttempt extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="notification_id",nullable=false) private Notification notification;
 @Column(nullable=false,length=20) private String channel; @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private DeliveryStatus status;
 @Column(nullable=false) private int attempts; @Column(name="available_at",nullable=false) private Instant availableAt;
 @Column(name="delivered_at") private Instant deliveredAt; @Column(name="last_error",length=500) private String lastError;
}
