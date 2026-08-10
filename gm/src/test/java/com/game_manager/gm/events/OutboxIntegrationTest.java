package com.game_manager.gm.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.game_manager.gm.common.config.GManagerProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import testsupport.DatabaseCleaner;

@SpringBootTest
@ActiveProfiles("test")
class OutboxIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired OutboxWriter writer;
    @Autowired OutboxStore store;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void cleanDatabase() {
        DatabaseCleaner.clean(jdbc);
    }

    @Test
    void businessTransactionAndEventCommitAndRollbackAtomically() {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        UUID aggregateId = UUID.randomUUID();
        transaction.executeWithoutResult(status -> writer.write(
                DomainEventType.ORDER_CREATED, "ORDER", aggregateId, Map.of("status", "CREATED")));

        assertThat(eventCount()).isOne();
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            writer.write(DomainEventType.ORDER_STATUS_CHANGED, "ORDER", aggregateId,
                    Map.of("status", "CANCELLED"));
            throw new IllegalStateException("failure injection");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(eventCount()).isOne();
        String payload = jdbc.queryForObject("SELECT payload FROM outbox_events", String.class);
        assertThat(payload).contains("\"schemaVersion\":1", "\"aggregateId\"")
                .doesNotContain("password", "token", "email");
    }

    @Test
    void duplicateDeliveryHasOneConsumerSideEffect() {
        UUID eventId = writeEvent();
        MutableClock clock = new MutableClock(Instant.now().plusSeconds(5));
        AtomicInteger sideEffects = new AtomicInteger();
        OutboxConsumer consumer = new OutboxConsumer() {
            public String name() { return "dedupe-test"; }
            public void consume(OutboxMessage message) { sideEffects.incrementAndGet(); }
        };
        OutboxPublisher publisher = publisher(clock, 3, consumer);

        publisher.publishAvailable();
        jdbc.update("UPDATE outbox_events SET status='PENDING', available_at=CURRENT_TIMESTAMP, "
                + "processed_at=NULL WHERE id=?", eventId.toString());
        publisher.publishAvailable();

        assertThat(sideEffects).hasValue(1);
        assertThat(store.count(OutboxStatus.PROCESSED)).isOne();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM outbox_consumer_receipts", Integer.class)).isOne();
        clock.advance(Duration.ofDays(31));
        assertThat(new OutboxOperations(store, properties(3), clock).applyRetention()).isOne();
        assertThat(eventCount()).isZero();
    }

    @Test
    void poisonEventRetriesWithBackoffThenMovesToVisibleDlqAndCanBeReplayed() {
        UUID eventId = writeEvent();
        MutableClock clock = new MutableClock(Instant.now().plusSeconds(5));
        OutboxConsumer poison = new OutboxConsumer() {
            public String name() { return "poison-test"; }
            public void consume(OutboxMessage message) { throw new IllegalStateException("poison"); }
        };
        OutboxPublisher publisher = publisher(clock, 2, poison);

        publisher.publishAvailable();
        assertThat(status(eventId)).isEqualTo("PENDING");
        TimestampValue retry = retryState(eventId);
        assertThat(retry.availableAt()).isAfter(clock.instant());
        clock.advance(Duration.ofSeconds(10));
        publisher.publishAvailable();

        assertThat(status(eventId)).isEqualTo("DEAD");
        assertThat(store.count(OutboxStatus.DEAD)).isOne();
        OutboxOperations operations = new OutboxOperations(store, properties(2), clock);
        assertThat(operations.replayDead(eventId)).isTrue();
        assertThat(status(eventId)).isEqualTo("PENDING");
    }

    @Test
    void concurrentWorkersClaimDifferentEvents() throws Exception {
        writeEvent();
        writeEvent();
        Instant now = Instant.now().plusSeconds(5);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<List<OutboxMessage>> first = executor.submit(() -> claimAfter(start, "worker-a", now));
            Future<List<OutboxMessage>> second = executor.submit(() -> claimAfter(start, "worker-b", now));
            start.countDown();

            List<OutboxMessage> firstClaim = first.get();
            List<OutboxMessage> secondClaim = second.get();
            assertThat(firstClaim).hasSizeLessThanOrEqualTo(1);
            assertThat(secondClaim).hasSizeLessThanOrEqualTo(1);
            assertThat(java.util.stream.Stream.concat(firstClaim.stream(), secondClaim.stream())
                    .map(OutboxMessage::id).distinct().count())
                    .isEqualTo(firstClaim.size() + secondClaim.size());
            assertThat(firstClaim.size() + secondClaim.size()).isPositive();

            List<OutboxMessage> remainder = new TransactionTemplate(transactionManager)
                    .execute(status -> store.claim("worker-c", 2, now, Duration.ofSeconds(30)));
            assertThat(firstClaim.size() + secondClaim.size() + remainder.size()).isEqualTo(2);
        }
    }

    private List<OutboxMessage> claimAfter(CountDownLatch start, String worker, Instant now)
            throws InterruptedException {
        start.await();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        return transaction.execute(status -> store.claim(worker, 1, now, Duration.ofSeconds(30)));
    }

    private UUID writeEvent() {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        return transaction.execute(status -> writer.write(
                DomainEventType.RESERVATION_CREATED, "RESERVATION", UUID.randomUUID(),
                Map.of("status", "PENDING")));
    }

    private OutboxPublisher publisher(Clock clock, int maxAttempts, OutboxConsumer consumer) {
        return new OutboxPublisher(store, List.of(consumer), properties(maxAttempts),
                transactionManager, new SimpleMeterRegistry(), clock);
    }

    private GManagerProperties properties(int maxAttempts) {
        GManagerProperties properties = mock(GManagerProperties.class);
        when(properties.outbox()).thenReturn(new GManagerProperties.Outbox(
                true, 10, 1000, 30, maxAttempts, 2, 30));
        return properties;
    }

    private long eventCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM outbox_events", Long.class);
    }

    private String status(UUID eventId) {
        return jdbc.queryForObject(
                "SELECT status FROM outbox_events WHERE id=?", String.class, eventId.toString());
    }

    private TimestampValue retryState(UUID eventId) {
        return jdbc.queryForObject("SELECT available_at FROM outbox_events WHERE id=?",
                (resultSet, row) -> new TimestampValue(
                        resultSet.getTimestamp("available_at").toInstant()), eventId.toString());
    }

    private record TimestampValue(Instant availableAt) {
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) { this.instant = instant; }
        void advance(Duration duration) { instant = instant.plus(duration); }
        public ZoneId getZone() { return ZoneId.of("UTC"); }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return instant; }
    }
}
