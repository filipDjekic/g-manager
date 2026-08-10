package com.game_manager.gm.events;

import com.game_manager.gm.common.config.GManagerProperties;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(prefix = "app.outbox", name = "enabled", havingValue = "true")
public class OutboxPublisher {
    private static final Logger LOGGER = LoggerFactory.getLogger(OutboxPublisher.class);
    private final OutboxStore store;
    private final List<OutboxConsumer> consumers;
    private final GManagerProperties.Outbox properties;
    private final TransactionTemplate transactions;
    private final MeterRegistry meterRegistry;
    private final Clock clock;
    private final String workerId = UUID.randomUUID().toString();
    private final AtomicBoolean running = new AtomicBoolean(true);

    public OutboxPublisher(OutboxStore store, List<OutboxConsumer> consumers,
                           GManagerProperties properties,
                           org.springframework.transaction.PlatformTransactionManager transactionManager,
                           MeterRegistry meterRegistry, Clock clock) {
        this.store = store;
        this.consumers = List.copyOf(consumers);
        this.properties = properties.outbox();
        this.transactions = new TransactionTemplate(transactionManager);
        this.meterRegistry = meterRegistry;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-millis:1000}")
    public void publishAvailable() {
        if (!running.get()) {
            return;
        }
        Instant now = clock.instant();
        List<OutboxMessage> claimed = transactions.execute(status -> store.claim(
                workerId, properties.batchSize(), now, Duration.ofSeconds(properties.leaseSeconds())));
        if (claimed == null) {
            return;
        }
        claimed.forEach(this::publish);
    }

    private void publish(OutboxMessage message) {
        String previousCorrelation = MDC.get("requestId");
        MDC.put("requestId", message.correlationId());
        try {
            transactions.executeWithoutResult(status -> {
                for (OutboxConsumer consumer : consumers) {
                    if (!store.hasReceipt(consumer.name(), message.id())) {
                        consumer.consume(message);
                        store.addReceipt(consumer.name(), message.id(), clock.instant());
                    }
                }
                store.markProcessed(message.id(), clock.instant());
            });
            meterRegistry.counter("gmanager.outbox.processed").increment();
        } catch (RuntimeException exception) {
            long delay = backoffSeconds(message.attempts());
            transactions.executeWithoutResult(status -> store.markFailed(
                    message.id(), message.attempts(), properties.maxAttempts(),
                    clock.instant().plusSeconds(delay), exception.getMessage()));
            String outcome = message.attempts() >= properties.maxAttempts() ? "dead" : "retry";
            meterRegistry.counter("gmanager.outbox.failed", "outcome", outcome).increment();
            LOGGER.warn("Outbox event {} processing failed; outcome={}", message.id(), outcome);
        } finally {
            if (previousCorrelation == null) {
                MDC.remove("requestId");
            } else {
                MDC.put("requestId", previousCorrelation);
            }
        }
    }

    private long backoffSeconds(int attempt) {
        int exponent = Math.min(Math.max(0, attempt - 1), 20);
        return Math.multiplyExact(properties.initialBackoffSeconds(), 1L << exponent);
    }

    @PreDestroy
    void stopClaiming() {
        running.set(false);
    }
}
