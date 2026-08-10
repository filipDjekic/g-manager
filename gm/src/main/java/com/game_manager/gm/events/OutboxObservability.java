package com.game_manager.gm.events;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;
import org.springframework.dao.DataAccessException;

@Component("outbox")
public class OutboxObservability implements HealthIndicator {
    private final OutboxStore store;
    private final Clock clock;

    public OutboxObservability(OutboxStore store, MeterRegistry registry, Clock clock) {
        this.store = store;
        this.clock = clock;
        Gauge.builder("gmanager.outbox.pending", store,
                        value -> value.count(OutboxStatus.PENDING))
                .register(registry);
        Gauge.builder("gmanager.outbox.dead", store,
                        value -> value.count(OutboxStatus.DEAD))
                .register(registry);
        Gauge.builder("gmanager.outbox.oldest.age.seconds", this,
                        value -> value.store.oldestPendingAgeSeconds(value.clock.instant()))
                .register(registry);
    }

    @Override
    public Health health() {
        try {
            long pending = store.count(OutboxStatus.PENDING);
            long processing = store.count(OutboxStatus.PROCESSING);
            long dead = store.count(OutboxStatus.DEAD);
            return Health.up().withDetail("pending", pending).withDetail("processing", processing)
                    .withDetail("dead", dead)
                    .withDetail("oldestPendingAgeSeconds", store.oldestPendingAgeSeconds(clock.instant()))
                    .build();
        } catch (DataAccessException exception) {
            return Health.down().withDetail("reason", "database-unavailable").build();
        }
    }
}
