package com.game_manager.gm.notification;

import com.game_manager.gm.common.security.*;
import com.game_manager.gm.notification.dto.NotificationResponse;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationRealtimeHubTest {
    @Test
    void failedWritesRemoveOnlyTheFailedConnectionAndLetMvcCompleteIt() throws Exception {
        var access = mock(RealtimeAccess.class);
        var actor = new AuthenticatedUser(UUID.randomUUID(), "sse@example.test", Role.CUSTOMER);
        when(access.capture(null)).thenReturn(new RealtimeAccess.Subscription(actor, Instant.now().plusSeconds(60)));
        when(access.isValid(any(), isNull())).thenReturn(true);
        var hub = new NotificationRealtimeHub(new SimpleMeterRegistry(), access);
        try (var construction = mockConstruction(SseEmitter.class)) {
            SseEmitter failed = hub.connect(actor.id(), 60000);
            SseEmitter healthy = hub.connect(actor.id(), 60000);
            doThrow(new IOException("client disconnected")).when(failed).send(any(SseEmitter.SseEventBuilder.class));
            hub.send(actor.id(), value());
            assertThat(hub.connections()).isEqualTo(1);
            verify(failed, never()).complete();
            verify(healthy).send(any(SseEmitter.SseEventBuilder.class));
            hub.heartbeat();
            verify(healthy, times(2)).send(any(SseEmitter.SseEventBuilder.class));
        }
    }

    @Test
    void timeoutAndRevocationCompleteAndRemoveConnectionsIdempotently() throws Exception {
        var access = mock(RealtimeAccess.class);
        var actor = new AuthenticatedUser(UUID.randomUUID(), "sse@example.test", Role.CUSTOMER);
        when(access.capture(null)).thenReturn(new RealtimeAccess.Subscription(actor, Instant.now().plusSeconds(60)));
        var timeout = new AtomicReference<Runnable>();
        try (var construction = mockConstruction(SseEmitter.class,
                (emitter, context) -> doAnswer(call -> { timeout.set(call.getArgument(0)); return null; })
                        .when(emitter).onTimeout(any()))) {
            var hub = new NotificationRealtimeHub(new SimpleMeterRegistry(), access);
            var emitter = hub.connect(actor.id(), 60000);
            timeout.get().run();
            timeout.get().run();
            assertThat(hub.connections()).isZero();
            verify(emitter, times(1)).complete();
            var revoked = hub.connect(actor.id(), 60000);
            hub.heartbeat();
            assertThat(hub.connections()).isZero();
            verify(revoked).complete();
            verify(revoked, never()).send(any(SseEmitter.SseEventBuilder.class));
        }
    }

    private NotificationResponse value() {
        return new NotificationResponse(UUID.randomUUID(), NotificationType.ORDER_CREATED, NotificationPriority.NORMAL,
                "Title", "Body", false, Instant.now(), null);
    }
}