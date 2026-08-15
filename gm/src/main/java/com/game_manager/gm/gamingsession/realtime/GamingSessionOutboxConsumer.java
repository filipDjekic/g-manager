package com.game_manager.gm.gamingsession.realtime;

import com.game_manager.gm.events.*;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class GamingSessionOutboxConsumer implements OutboxConsumer {
    private static final Set<String> TYPES = Set.of(
            DomainEventType.GAMING_SESSION_STARTED.name(), DomainEventType.GAMING_SESSION_EXTENDED.name(),
            DomainEventType.GAMING_SESSION_TERMINATED.name(), DomainEventType.GAMING_SESSION_EXPIRED.name());
    private final GamingSessionRealtimeHub hub;
    public GamingSessionOutboxConsumer(GamingSessionRealtimeHub hub) { this.hub = hub; }
    @Override public String name() { return "gaming-session-sse"; }
    @Override public void consume(OutboxMessage message) {
        if (TYPES.contains(message.eventType())) hub.send(new GamingSessionEvent(
                message.id(), message.eventType(), message.aggregateId(), message.occurredAt()));
    }
}
