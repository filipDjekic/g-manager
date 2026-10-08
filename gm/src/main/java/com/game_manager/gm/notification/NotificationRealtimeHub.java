package com.game_manager.gm.notification;

import com.game_manager.gm.common.security.RealtimeAccess;
import com.game_manager.gm.notification.dto.NotificationResponse;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class NotificationRealtimeHub {
    private final Map<SseEmitter, RealtimeAccess.Subscription> clients = new ConcurrentHashMap<>();
    private final MeterRegistry metrics;
    private final RealtimeAccess access;

    public NotificationRealtimeHub(MeterRegistry metrics, RealtimeAccess access) {
        this.metrics = metrics;
        this.access = access;
    }

    public SseEmitter connect(UUID userId, long timeout) {
        var subscription = access.capture(null);
        if (!subscription.actor().id().equals(userId))
            throw new IllegalArgumentException("SSE recipient does not match the authenticated user");
        SseEmitter emitter = new SseEmitter(timeout);
        clients.put(emitter, subscription);
        emitter.onCompletion(() -> clients.remove(emitter));
        emitter.onTimeout(() -> close(emitter));
        emitter.onError(error -> clients.remove(emitter));
        metrics.counter("gm.notification.sse.connections").increment();
        return emitter;
    }

    public void send(UUID userId, NotificationResponse value) {
        clients.forEach((emitter, subscription) -> {
            if (subscription.actor().id().equals(userId)) send(emitter, value);
        });
    }

    public boolean send(SseEmitter emitter, NotificationResponse value) {
        var subscription = clients.get(emitter);
        if (subscription == null) return false;
        if (!access.isValid(subscription, null)) { close(emitter); return false; }
        return write(emitter, SseEmitter.event().id(value.id().toString()).name("notification").data(value));
    }

    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        clients.forEach((emitter, subscription) -> {
            if (!access.isValid(subscription, null)) close(emitter);
            else write(emitter, SseEmitter.event().name("heartbeat").comment("keepalive"));
        });
    }

    private boolean write(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
            return true;
        } catch (IOException | IllegalStateException exception) {
            // MVC/container owns completion after a failed write. Remove only our subscription.
            clients.remove(emitter);
            return false;
        }
    }

    public void close(SseEmitter emitter) {
        if (clients.remove(emitter) != null) emitter.complete();
    }

    public int connections() { return clients.size(); }
}