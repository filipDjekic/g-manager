package com.game_manager.gm.notification;
import java.time.Instant; import java.util.List; import java.util.Optional; import java.util.UUID;
import org.springframework.data.domain.Pageable; import org.springframework.data.jpa.repository.JpaRepository; import org.springframework.data.jpa.repository.Query; import org.springframework.data.repository.query.Param;
interface NotificationRepository extends JpaRepository<Notification,UUID> {
 List<Notification> findByRecipientIdAndInAppVisibleTrueOrderByCreatedAtDescIdDesc(UUID recipientId, Pageable pageable);
 Optional<Notification> findByIdAndRecipientId(UUID id, UUID recipientId);
 long countByRecipientIdAndInAppVisibleTrueAndReadAtIsNull(UUID recipientId);
 boolean existsBySourceEventIdAndRecipientIdAndType(UUID eventId, UUID recipientId, NotificationType type);
 @Query("select min(n.createdAt) from Notification n where n.readAt is null")
 Optional<Instant> oldestUnreadCreatedAt();
 @Query("select n from Notification n where n.recipientId=:recipient and n.inAppVisible=true and (n.createdAt>:created or (n.createdAt=:created and n.id>:id)) order by n.createdAt,n.id")
 List<Notification> replayAfter(@Param("recipient") UUID recipient,@Param("created") Instant created,@Param("id") UUID id,Pageable pageable);
 long deleteByReadAtBefore(Instant cutoff);
 @Query("select n from Notification n where n.recipientId=:recipient and n.inAppVisible=true and n.readAt is null and n.createdAt>=:from and n.createdAt<:to order by n.priority desc,n.createdAt desc,n.id desc")
 List<Notification> attentionBetween(@Param("recipient")UUID recipient,@Param("from")Instant from,@Param("to")Instant to,Pageable pageable);
}
