package com.game_manager.gm.notification;
import java.util.List; import java.util.Optional; import java.util.UUID; import org.springframework.data.jpa.repository.JpaRepository;
interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference,UUID> {
 Optional<NotificationPreference> findByRecipientIdAndType(UUID recipientId,NotificationType type);
 List<NotificationPreference> findByRecipientIdOrderByType(UUID recipientId);
}
