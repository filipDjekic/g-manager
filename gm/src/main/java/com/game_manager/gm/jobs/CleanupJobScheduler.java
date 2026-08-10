package com.game_manager.gm.jobs;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "app.jobs", name = "enabled", havingValue = "true")
public class CleanupJobScheduler {
    private final JobService jobService;
    private final Clock clock;

    public CleanupJobScheduler(JobService jobService, Clock clock) {
        this.jobService = jobService;
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "${app.jobs.cleanup-initial-delay-millis:5000}",
            fixedDelayString = "${app.jobs.cleanup-schedule-millis:3600000}")
    public void scheduleDailyCleanup() {
        String date = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).toString();
        enqueue(CleanupJobTypes.REFRESH_TOKENS, date);
        enqueue(CleanupJobTypes.IDEMPOTENCY, date);
        enqueue(CleanupJobTypes.AUDIT, date);
        enqueue(CleanupJobTypes.OUTBOX, date);
    }

    private void enqueue(String type, String date) {
        jobService.enqueue(type, Map.of(), type + ":" + date);
    }
}
