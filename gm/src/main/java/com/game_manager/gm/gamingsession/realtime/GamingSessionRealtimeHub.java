package com.game_manager.gm.gamingsession.realtime;

import io.micrometer.core.instrument.MeterRegistry;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.GamingSessionLocationPolicy;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class GamingSessionRealtimeHub {
    private final Map<SseEmitter, RealtimeAccess.Subscription> clients = new ConcurrentHashMap<>();
    private final MeterRegistry metrics;
    private final RealtimeAccess access;
    private final GamingSessionRepository sessions;
    private final GamingSessionLocationPolicy locations;

    public GamingSessionRealtimeHub(MeterRegistry metrics, RealtimeAccess access,
            GamingSessionRepository sessions, GamingSessionLocationPolicy locations) {
        this.metrics = metrics;
        this.access = access;
        this.sessions = sessions;
        this.locations = locations;
    }

    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public SseEmitter connect() {
        var subscription = access.capture(Permission.GAMING_SESSION_READ);
        SseEmitter emitter = new SseEmitter(1_800_000L);
        clients.put(emitter, subscription);
        emitter.onCompletion(() -> clients.remove(emitter));
        emitter.onTimeout(() -> close(emitter));
        emitter.onError(error -> clients.remove(emitter));
        metrics.counter("gmanager.gaming.sessions.sse.connections").increment();
        return emitter;
    }

    public void send(GamingSessionEvent event) {
        if (clients.isEmpty()) return;
        var session = sessions.findById(event.sessionId()).orElse(null);
        if (session == null) return;
        clients.forEach((emitter, subscription) -> {
            if (!access.isValid(subscription, Permission.GAMING_SESSION_READ)) { close(emitter); return; }
            if (locations.canAccess(subscription.actor(), session.getLocationId()))
                write(emitter, SseEmitter.event().id(event.eventId().toString()).name("gaming-session").data(event));
        });
    }

    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        clients.forEach((emitter, subscription) -> {
            if (!access.isValid(subscription, Permission.GAMING_SESSION_READ)) close(emitter);
            else write(emitter, SseEmitter.event().name("heartbeat").comment("keepalive"));
        });
    }

    private void write(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException exception) {
            clients.remove(emitter);
        }
    }

    private void close(SseEmitter emitter) {
        if (clients.remove(emitter) != null) emitter.complete();
    }
}