package com.game_manager.gm.notification;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.notification.dto.*;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.user.UserService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationReplayTest {
    @Test
    void replayQueryFailureClosesTheRegisteredEmitterAndPropagatesTheOriginalFailure() {
        var notifications = mock(NotificationRepository.class);
        var realtime = mock(NotificationRealtimeHub.class);
        var current = mock(CurrentUserProvider.class);
        var actor = new AuthenticatedUser(UUID.randomUUID(), "replay@example.test", Role.CUSTOMER);
        when(current.requireCurrentUser()).thenReturn(actor);
        var properties = mock(GManagerProperties.class);
        when(properties.notifications()).thenReturn(new GManagerProperties.Notifications(false, 25, 5, 10, 90, 1800));
        var emitter = mock(SseEmitter.class);
        when(realtime.connect(actor.id(), 1800000)).thenReturn(emitter);
        UUID cursor = UUID.randomUUID();
        var failure = new IllegalStateException("replay query failed");
        when(notifications.findByIdAndRecipientId(cursor, actor.id())).thenThrow(failure);
        var service = new NotificationService(notifications, mock(NotificationPreferenceRepository.class),
                mock(NotificationTemplateRepository.class), mock(NotificationDeliveryRepository.class),
                mock(ReservationService.class), mock(OrderService.class), mock(UserService.class), current,
                mock(NotificationTemplateRenderer.class), realtime, List.of(), new ObjectMapper(),
                Clock.systemUTC(), new SimpleMeterRegistry(), properties);
        assertThatThrownBy(() -> service.connect(cursor.toString())).isSameAs(failure);
        var order = inOrder(realtime, notifications);
        order.verify(realtime).connect(actor.id(), 1800000);
        order.verify(notifications).findByIdAndRecipientId(cursor, actor.id());
        order.verify(realtime).close(emitter);
    }
}