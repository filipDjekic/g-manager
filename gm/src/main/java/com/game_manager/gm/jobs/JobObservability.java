package com.game_manager.gm.jobs;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.ObjectProvider;

@Component("backgroundJobs")
public class JobObservability implements HealthIndicator {
    private final JobStore store;
    private final Clock clock;
    private final ObjectProvider<JobRunner> runnerProvider;

    public JobObservability(JobStore store, MeterRegistry registry, Clock clock,
                            ObjectProvider<JobRunner> runnerProvider) {
        this.store = store;
        this.clock = clock;
        this.runnerProvider = runnerProvider;
        Gauge.builder("gmanager.jobs.queued", store,
                        value -> value.count(JobStatus.QUEUED) + value.count(JobStatus.RETRY))
                .register(registry);
        Gauge.builder("gmanager.jobs.running", store,
                        value -> value.count(JobStatus.RUNNING))
                .register(registry);
        Gauge.builder("gmanager.jobs.dead", store,
                        value -> value.count(JobStatus.DEAD))
                .register(registry);
        Gauge.builder("gmanager.jobs.oldest.age.seconds", this,
                        value -> value.store.oldestQueuedAgeSeconds(value.clock.instant()))
                .register(registry);
    }

    @Override
    public Health health() {
        JobRunner runner = runnerProvider.getIfAvailable();
        return Health.up()
                .withDetail("queued", store.count(JobStatus.QUEUED))
                .withDetail("retry", store.count(JobStatus.RETRY))
                .withDetail("running", store.count(JobStatus.RUNNING))
                .withDetail("dead", store.count(JobStatus.DEAD))
                .withDetail("oldestQueuedAgeSeconds", store.oldestQueuedAgeSeconds(clock.instant()))
                .withDetail("workerEnabled", runner != null)
                .withDetail("workerAccepting", runner != null && runner.isAccepting())
                .withDetail("activeWorkers", runner == null ? 0 : runner.activeWorkers())
                .build();
    }
}
