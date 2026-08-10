package com.game_manager.gm.jobs;

import java.time.Clock;
import java.time.Duration;

public final class JobContext {
    private final JobStore store;
    private final JobRecord job;
    private final Clock clock;
    private final Duration lease;

    JobContext(JobStore store, JobRecord job, Clock clock, Duration lease) {
        this.store = store;
        this.job = job;
        this.clock = clock;
        this.lease = lease;
    }

    public void heartbeat() {
        if (!store.heartbeat(job.id(), job.leaseToken(), clock.instant(), lease)) {
            throw new JobCancelledException();
        }
    }

    public void checkCancellation() {
        if (Thread.currentThread().isInterrupted()
                || store.isCancellationRequested(job.id(), job.leaseToken())) {
            throw new JobCancelledException();
        }
    }
}
