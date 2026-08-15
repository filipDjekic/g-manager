package com.game_manager.gm.gamingsession.job;

import com.game_manager.gm.jobs.JobService;
import java.time.Clock;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "app.jobs", name = "enabled", havingValue = "true")
public class GamingSessionJobScheduler {
    private final JobService jobs;
    private final Clock clock;
    public GamingSessionJobScheduler(JobService jobs, Clock clock) { this.jobs = jobs; this.clock = clock; }

    @Scheduled(fixedDelayString = "${app.gaming-session.expiration-schedule-millis:10000}")
    public void scheduleExpiration() {
        long bucket = clock.instant().getEpochSecond() / 10;
        jobs.enqueue(GamingSessionJobTypes.EXPIRATION, Map.of(), "gaming-session-expiration:" + bucket);
    }

    @Scheduled(initialDelayString = "${app.gaming-session.reconciliation-initial-delay-millis:30000}",
            fixedDelayString = "${app.gaming-session.reconciliation-schedule-millis:300000}")
    public void scheduleReconciliation() {
        long bucket = clock.instant().getEpochSecond() / 300;
        jobs.enqueue(GamingSessionJobTypes.RECONCILIATION, Map.of(), "gaming-session-reconciliation:" + bucket);
    }
}
