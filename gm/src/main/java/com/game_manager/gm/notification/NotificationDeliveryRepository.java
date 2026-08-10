package com.game_manager.gm.notification;
import java.time.Instant; import java.util.List; import java.util.UUID; import org.springframework.data.domain.Pageable; import org.springframework.data.jpa.repository.JpaRepository;
interface NotificationDeliveryRepository extends JpaRepository<NotificationDeliveryAttempt,UUID> {
 List<NotificationDeliveryAttempt> findByStatusAndAvailableAtLessThanEqualOrderByCreatedAt(DeliveryStatus status,Instant now,Pageable pageable);
 long countByStatus(DeliveryStatus status);
 java.util.Optional<NotificationDeliveryAttempt> findFirstByNotificationRecipientId(UUID recipientId);
}
