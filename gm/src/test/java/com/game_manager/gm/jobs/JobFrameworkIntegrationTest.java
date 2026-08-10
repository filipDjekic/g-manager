package com.game_manager.gm.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import testsupport.DatabaseCleaner;

@SpringBootTest
@ActiveProfiles("test")
class JobFrameworkIntegrationTest {
    @Autowired JobService jobService;
    @Autowired JobStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JobHandlerRegistry handlerRegistry;
    @Autowired JobObservability health;
    @Autowired Clock applicationClock;

    @BeforeEach
    void cleanDatabase() {
        DatabaseCleaner.clean(jdbc);
    }

    @Test
    void enqueueIsDeduplicatedAndPayloadContainsNoInfrastructureSecrets() {
        MDC.put("requestId", "stage13-job-correlation");
        UUID first;
        UUID duplicate;
        try {
            first = jobService.enqueue("test", Map.of("scope", "safe"), "daily:test");
            duplicate = jobService.enqueue("test", Map.of("scope", "ignored"), "daily:test");
        } finally {
            MDC.remove("requestId");
        }

        assertThat(duplicate).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM background_jobs", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT payload FROM background_jobs", String.class))
                .contains("safe").doesNotContain("password", "token", "secret");
        assertThat(jdbc.queryForObject("SELECT correlation_id FROM background_jobs", String.class))
                .isEqualTo("stage13-job-correlation");
    }

    @Test
    void dailySchedulerRegistersEveryRetentionJobExactlyOnce() {
        CleanupJobScheduler scheduler = new CleanupJobScheduler(jobService, applicationClock);
        scheduler.scheduleDailyCleanup();
        scheduler.scheduleDailyCleanup();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM background_jobs", Integer.class))
                .isEqualTo(4);
        assertThat(List.of(CleanupJobTypes.REFRESH_TOKENS, CleanupJobTypes.IDEMPOTENCY,
                CleanupJobTypes.AUDIT, CleanupJobTypes.OUTBOX))
                .allSatisfy(type -> assertThat(handlerRegistry.require(type)).isNotNull());
    }

    @Test
    void twoRunnersNeverOwnTheSameAttemptAndExpiredLeaseIsRecovered() throws Exception {
        jobService.enqueue("test", Map.of(), null);
        jobService.enqueue("test", Map.of(), null);
        Instant now = Instant.now().plusSeconds(5);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<List<JobRecord>> first = executor.submit(() -> claimAfter(start, "worker-a", now));
            Future<List<JobRecord>> second = executor.submit(() -> claimAfter(start, "worker-b", now));
            start.countDown();
            List<JobRecord> combined = new java.util.ArrayList<>(first.get());
            combined.addAll(second.get());
            assertThat(combined).extracting(JobRecord::id).doesNotHaveDuplicates();
            assertThat(combined).isNotEmpty();
        }

        UUID recoverable = jobService.enqueue("test", Map.of(), null);
        JobRecord original = transaction().execute(status -> store.claim(
                "crashed-worker", 10, now, Duration.ofSeconds(10)).stream()
                .filter(job -> job.id().equals(recoverable)).findFirst().orElseThrow());
        JobRecord recovered = transaction().execute(status -> store.claim(
                "replacement-worker", 10, now.plusSeconds(11), Duration.ofSeconds(10)).stream()
                .filter(job -> job.id().equals(recoverable)).findFirst().orElseThrow());

        assertThat(recovered.attempt()).isEqualTo(original.attempt() + 1);
        assertThat(recovered.leaseToken()).isNotEqualTo(original.leaseToken());
        assertThat(attemptStatus(recoverable, original.leaseToken())).isEqualTo("LEASE_EXPIRED");

        UUID abandonedCancellation = jobService.enqueue("test", Map.of(), null);
        JobRecord abandoned = transaction().execute(status -> store.claim(
                "cancelled-worker", 10, now.plusSeconds(20), Duration.ofSeconds(10)).stream()
                .filter(job -> job.id().equals(abandonedCancellation)).findFirst().orElseThrow());
        assertThat(jobService.cancel(abandonedCancellation)).isTrue();
        List<JobRecord> afterCancellationLease = transaction().execute(status -> store.claim(
                "recovery-worker", 10, now.plusSeconds(31), Duration.ofSeconds(10)));
        assertThat(afterCancellationLease).noneMatch(job -> job.id().equals(abandonedCancellation));
        assertThat(status(abandonedCancellation)).isEqualTo("CANCELLED");
        assertThat(attemptStatus(abandonedCancellation, abandoned.leaseToken()))
                .isEqualTo("CANCELLED");
    }

    @Test
    void failureUsesDeterministicBackoffThenDeadAndExplicitRetryRecoversIt() {
        UUID id = jobService.enqueue("poison", Map.of(), null, 0, Instant.now(), 2,
                Duration.ofSeconds(30));
        MutableClock clock = new MutableClock(Instant.now().plusSeconds(5));
        JobHandler poison = handler("poison", (job, context) -> {
            throw new IllegalStateException("safe failure");
        });
        JobRunner runner = runner(clock, 30, poison);
        try {
            runner.poll();
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                    assertThat(status(id)).isEqualTo("RETRY"));
            assertThat(availableAt(id)).isBetween(
                    clock.instant().plusSeconds(2).truncatedTo(java.time.temporal.ChronoUnit.MICROS),
                    clock.instant().plusSeconds(3).plusMillis(1));
            clock.advance(Duration.ofSeconds(4));
            runner.poll();
            await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                    assertThat(status(id)).isEqualTo("DEAD"));
            assertThat(jobService.retry(id)).isTrue();
            assertThat(status(id)).isEqualTo("RETRY");
            assertThat(attemptCount(id)).isEqualTo(2);
        } finally {
            runner.shutdown();
        }
    }

    @Test
    void timeoutCancellationShutdownAndHealthAreVisible() {
        UUID timeoutId = jobService.enqueue("slow", Map.of(), null, 0, Instant.now(), 2,
                Duration.ofSeconds(1));
        MutableClock clock = new MutableClock(Instant.now().plusSeconds(5));
        JobHandler slow = handler("slow", (job, context) -> {
            long until = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            while (System.nanoTime() < until) {
                Thread.onSpinWait();
            }
        });
        JobRunner runner = runner(clock, 1, slow);
        runner.poll();
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                assertThat(status(timeoutId)).isEqualTo("RETRY"));

        UUID cancelled = jobService.enqueue("slow", Map.of(), null);
        assertThat(jobService.cancel(cancelled)).isTrue();
        assertThat(status(cancelled)).isEqualTo("CANCELLED");
        assertThat(health.health().getStatus()).isEqualTo(Status.UP);
        assertThat(health.health().getDetails()).containsKeys("queued", "running", "dead");

        runner.shutdown();
        assertThat(runner.isAccepting()).isFalse();
    }

    private List<JobRecord> claimAfter(CountDownLatch start, String worker, Instant now)
            throws InterruptedException {
        start.await();
        return transaction().execute(status -> store.claim(worker, 1, now, Duration.ofSeconds(10)));
    }

    private JobRunner runner(Clock clock, long timeoutSeconds, JobHandler handler) {
        GManagerProperties properties = mock(GManagerProperties.class);
        when(properties.jobs()).thenReturn(new GManagerProperties.Jobs(
                true, 2, 2, 2, 1000, 10, timeoutSeconds, 2, 2, 5, 30, 365));
        return new JobRunner(store, new JobHandlerRegistry(List.of(handler)), properties,
                transactionManager, new SimpleMeterRegistry(), clock);
    }

    private JobHandler handler(String type, HandlerAction action) {
        return new JobHandler() {
            public String type() { return type; }
            public void handle(JobRecord job, JobContext context) { action.run(job, context); }
        };
    }

    private TransactionTemplate transaction() {
        return new TransactionTemplate(transactionManager);
    }

    private String status(UUID id) {
        return jdbc.queryForObject(
                "SELECT status FROM background_jobs WHERE id=?", String.class, id.toString());
    }

    private Instant availableAt(UUID id) {
        return jdbc.queryForObject("SELECT available_at FROM background_jobs WHERE id=?",
                (resultSet, row) -> resultSet.getTimestamp(1).toInstant(), id.toString());
    }

    private int attemptCount(UUID id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM background_job_attempts WHERE job_id=?",
                Integer.class, id.toString());
    }

    private String attemptStatus(UUID id, UUID leaseToken) {
        return jdbc.queryForObject("""
                SELECT status FROM background_job_attempts WHERE job_id=? AND lease_token=?
                """, String.class, id.toString(), leaseToken.toString());
    }

    @FunctionalInterface
    private interface HandlerAction {
        void run(JobRecord job, JobContext context);
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
