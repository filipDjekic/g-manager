package com.game_manager.gm.jobs;

import com.game_manager.gm.common.config.GManagerProperties;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(prefix = "app.jobs", name = "enabled", havingValue = "true")
public class JobRunner {
    private static final Logger LOGGER = LoggerFactory.getLogger(JobRunner.class);
    private final JobStore store;
    private final JobHandlerRegistry registry;
    private final GManagerProperties.Jobs properties;
    private final TransactionTemplate transactions;
    private final MeterRegistry meterRegistry;
    private final Clock clock;
    private final String workerId = UUID.randomUUID().toString();
    private final AtomicBoolean accepting = new AtomicBoolean(true);
    private final ThreadPoolTaskExecutor workerPool;
    private final ScheduledExecutorService watchdog;

    public JobRunner(JobStore store, JobHandlerRegistry registry, GManagerProperties properties,
                     PlatformTransactionManager transactionManager, MeterRegistry meterRegistry,
                     Clock clock) {
        this.store = store;
        this.registry = registry;
        this.properties = properties.jobs();
        this.transactions = new TransactionTemplate(transactionManager);
        this.meterRegistry = meterRegistry;
        this.clock = clock;
        this.workerPool = createWorkerPool(this.properties);
        this.watchdog = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "job-timeout-watchdog");
            thread.setDaemon(true);
            return thread;
        });
    }

    @Scheduled(fixedDelayString = "${app.jobs.poll-interval-millis:1000}")
    public void poll() {
        if (!accepting.get()) {
            return;
        }
        int slots = Math.max(0, properties.workerCount() - workerPool.getActiveCount());
        int limit = Math.min(slots, properties.claimBatchSize());
        if (limit == 0) {
            return;
        }
        Instant now = clock.instant();
        List<JobRecord> claimed = transactions.execute(status -> store.claim(
                workerId, limit, now, Duration.ofSeconds(properties.leaseSeconds())));
        if (claimed != null) {
            claimed.forEach(this::submit);
        }
    }

    private void submit(JobRecord job) {
        meterRegistry.counter("gmanager.jobs.attempts", "type", job.type()).increment();
        Future<?> future = workerPool.submit(() -> execute(job));
        watchdog.schedule(() -> timeout(job, future), job.timeoutSeconds(), TimeUnit.SECONDS);
    }

    private void execute(JobRecord job) {
        Timer.Sample sample = Timer.start(meterRegistry);
        String outcome = "completed";
        String previousCorrelation = MDC.get("requestId");
        MDC.put("requestId", job.correlationId());
        try {
            JobContext context = new JobContext(store, job, clock,
                    Duration.ofSeconds(properties.leaseSeconds()));
            context.checkCancellation();
            registry.require(job.type()).handle(job, context);
            context.checkCancellation();
            transactions.executeWithoutResult(status -> store.complete(
                    job.id(), job.leaseToken(), clock.instant()));
        } catch (JobCancelledException exception) {
            outcome = "cancelled";
            transactions.executeWithoutResult(status -> store.cancelled(job, clock.instant()));
        } catch (RuntimeException exception) {
            outcome = fail(job, exception.getMessage(), JobAttemptStatus.FAILED);
        } finally {
            sample.stop(meterRegistry.timer("gmanager.jobs.duration", "type", job.type(),
                    "outcome", outcome));
            if (previousCorrelation == null) {
                MDC.remove("requestId");
            } else {
                MDC.put("requestId", previousCorrelation);
            }
        }
    }

    private void timeout(JobRecord job, Future<?> future) {
        if (future.isDone()) {
            return;
        }
        future.cancel(true);
        String outcome = fail(job, "Job execution timed out", JobAttemptStatus.TIMED_OUT);
        meterRegistry.counter("gmanager.jobs.timeouts", "outcome", outcome).increment();
    }

    private String fail(JobRecord job, String error, JobAttemptStatus attemptStatus) {
        long delay = backoffSeconds(job);
        boolean updated = Boolean.TRUE.equals(transactions.execute(status -> store.fail(
                job, clock.instant(), clock.instant().plusSeconds(delay), error, attemptStatus)));
        String outcome = job.attempt() >= job.maxAttempts() ? "dead" : "retry";
        if (updated) {
            meterRegistry.counter("gmanager.jobs.failures", "type", job.type(),
                    "outcome", outcome).increment();
            LOGGER.warn("Job {} failed; outcome={}", job.id(), outcome);
        }
        return outcome;
    }

    private long backoffSeconds(JobRecord job) {
        int exponent = Math.min(Math.max(0, job.attempt() - 1), 20);
        long base = properties.initialBackoffSeconds() * (1L << exponent);
        long jitterRange = Math.max(1, base / 4);
        long jitter = Math.floorMod(job.id().hashCode(), jitterRange + 1);
        return base + jitter;
    }

    @PreDestroy
    public void shutdown() {
        accepting.set(false);
        watchdog.shutdownNow();
        workerPool.shutdown();
    }

    boolean isAccepting() {
        return accepting.get();
    }

    int activeWorkers() {
        return workerPool.getActiveCount();
    }

    private static ThreadPoolTaskExecutor createWorkerPool(GManagerProperties.Jobs properties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.workerCount());
        executor.setMaxPoolSize(properties.workerCount());
        executor.setQueueCapacity(properties.queueCapacity());
        executor.setThreadNamePrefix("background-job-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds((int) properties.shutdownWaitSeconds());
        executor.initialize();
        return executor;
    }
}
