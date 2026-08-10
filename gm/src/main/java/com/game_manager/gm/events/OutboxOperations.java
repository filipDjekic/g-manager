package com.game_manager.gm.events;

import com.game_manager.gm.common.config.GManagerProperties;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxOperations {
    private final OutboxStore store;
    private final GManagerProperties.Outbox properties;
    private final Clock clock;

    public OutboxOperations(OutboxStore store, GManagerProperties properties, Clock clock) {
        this.store = store;
        this.properties = properties.outbox();
        this.clock = clock;
    }

    @Transactional
    public boolean replayDead(UUID eventId) {
        return store.replayDead(eventId, clock.instant()) == 1;
    }

    @Transactional
    public int applyRetention() {
        return store.deleteProcessedBefore(
                clock.instant().minus(properties.retentionDays(), ChronoUnit.DAYS));
    }
}
