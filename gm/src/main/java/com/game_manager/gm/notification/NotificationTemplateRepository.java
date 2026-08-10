package com.game_manager.gm.notification;
import java.util.Optional; import java.util.UUID; import org.springframework.data.jpa.repository.JpaRepository;
interface NotificationTemplateRepository extends JpaRepository<NotificationTemplate,UUID> { Optional<NotificationTemplate> findByTypeAndLocale(NotificationType type,String locale); }
