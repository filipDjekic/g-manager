package com.game_manager.gm.gamingsession.job;

import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.GamingSessionStatus;
import com.game_manager.gm.gamingsession.billing.GamingTimeService;
import com.game_manager.gm.jobs.JobContext;
import com.game_manager.gm.jobs.JobHandler;
import com.game_manager.gm.jobs.JobRecord;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Expiry uses the same customer/station/session lock order and accounting as leases. */
@Component @RequiredArgsConstructor
public class GamingSessionExpirationJobHandler implements JobHandler {
    private final GamingSessionRepository sessions;
    private final GamingTimeService time;
    private final MeterRegistry metrics;
    @Override public String type() { return GamingSessionJobTypes.EXPIRATION; }
    @Override public void handle(JobRecord job, JobContext context) {
        var active = sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE);
        for (var session : active) {
            context.checkCancellation();
            time.tick(session.getId(), false, false);
        }
        metrics.summary("gmanager.gaming.sessions.expiration.batch").record(active.size());
    }
}
