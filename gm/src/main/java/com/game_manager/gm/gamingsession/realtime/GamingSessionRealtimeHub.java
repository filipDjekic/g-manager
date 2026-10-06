package com.game_manager.gm.gamingsession.realtime;

import io.micrometer.core.instrument.MeterRegistry;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.GamingSessionLocationPolicy;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class GamingSessionRealtimeHub {
    private final Map<SseEmitter, AuthenticatedUser> clients = new ConcurrentHashMap<>();
    private final MeterRegistry metrics;
    private final CurrentUserProvider currentUser;
    private final GamingSessionRepository sessions;
    private final GamingSessionLocationPolicy locations;
    public GamingSessionRealtimeHub(MeterRegistry metrics, CurrentUserProvider currentUser,
            GamingSessionRepository sessions, GamingSessionLocationPolicy locations) {
        this.metrics = metrics; this.currentUser = currentUser;
        this.sessions = sessions; this.locations = locations;
    }
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public SseEmitter connect() {
        SseEmitter emitter = new SseEmitter(1_800_000L); clients.put(emitter, currentUser.requireCurrentUser());
        emitter.onCompletion(() -> clients.remove(emitter)); emitter.onTimeout(() -> clients.remove(emitter));
        emitter.onError(error -> clients.remove(emitter));
        metrics.counter("gmanager.gaming.sessions.sse.connections").increment();
        return emitter;
    }
    public void send(GamingSessionEvent event) {
        if (clients.isEmpty()) return;
        var session = sessions.findById(event.sessionId()).orElse(null);
        if (session == null) return;
        Map<AuthenticatedUser, Boolean> access = new HashMap<>();
        for (var subscription : Map.copyOf(clients).entrySet()) {
            SseEmitter emitter = subscription.getKey();
            if (!access.computeIfAbsent(subscription.getValue(),
                    actor -> locations.canAccess(actor, session.getLocationId()))) continue;
            try {
            emitter.send(SseEmitter.event().id(event.eventId().toString())
                    .name("gaming-session").data(event));
        } catch (Exception exception) { clients.remove(emitter); emitter.complete(); }
        }
    }
    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        for (SseEmitter emitter : List.copyOf(clients.keySet())) try {
            emitter.send(SseEmitter.event().name("heartbeat").comment("keepalive"));
        } catch (Exception exception) { clients.remove(emitter); emitter.complete(); }
    }
}
