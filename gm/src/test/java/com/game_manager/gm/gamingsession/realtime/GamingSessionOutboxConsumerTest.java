package com.game_manager.gm.gamingsession.realtime;

import static org.mockito.Mockito.*;
import com.game_manager.gm.events.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class GamingSessionOutboxConsumerTest {
    @Test void publishesSessionEventsAndIgnoresUnrelatedDelayedOutboxMessages() {
        GamingSessionRealtimeHub hub = mock(GamingSessionRealtimeHub.class);
        GamingSessionOutboxConsumer consumer = new GamingSessionOutboxConsumer(hub);
        UUID eventId = UUID.randomUUID(), sessionId = UUID.randomUUID(); Instant occurred = Instant.now();
        consumer.consume(new OutboxMessage(eventId, DomainEventType.GAMING_SESSION_EXPIRED.name(), 1,
                "GAMING_SESSION", sessionId, occurred, "correlation", "{}", 3));
        consumer.consume(new OutboxMessage(UUID.randomUUID(), DomainEventType.ORDER_CREATED.name(), 1,
                "ORDER", UUID.randomUUID(), occurred, "correlation", "{}", 1));
        verify(hub).send(new GamingSessionEvent(eventId, DomainEventType.GAMING_SESSION_EXPIRED.name(),
                sessionId, occurred));
        verifyNoMoreInteractions(hub);
    }
}
