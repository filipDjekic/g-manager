package com.game_manager.gm.gamingsession.realtime;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class GamingSessionRealtimeHub {
    private final Set<SseEmitter> clients = ConcurrentHashMap.newKeySet();
    private final MeterRegistry metrics;
    public GamingSessionRealtimeHub(MeterRegistry metrics) { this.metrics = metrics; }
    public SseEmitter connect() {
        SseEmitter emitter = new SseEmitter(1_800_000L); clients.add(emitter);
        emitter.onCompletion(() -> clients.remove(emitter)); emitter.onTimeout(() -> clients.remove(emitter));
        emitter.onError(error -> clients.remove(emitter));
        metrics.counter("gmanager.gaming.sessions.sse.connections").increment();
        return emitter;
    }
    public void send(GamingSessionEvent event) {
        for (SseEmitter emitter : List.copyOf(clients)) try {
            emitter.send(SseEmitter.event().id(event.eventId().toString())
                    .name("gaming-session").data(event));
        } catch (Exception exception) { clients.remove(emitter); emitter.complete(); }
    }
    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        for (SseEmitter emitter : List.copyOf(clients)) try {
            emitter.send(SseEmitter.event().name("heartbeat").comment("keepalive"));
        } catch (Exception exception) { clients.remove(emitter); emitter.complete(); }
    }
}
