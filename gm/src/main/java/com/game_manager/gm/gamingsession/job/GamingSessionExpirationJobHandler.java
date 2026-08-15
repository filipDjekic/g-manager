package com.game_manager.gm.gamingsession.job;

import com.game_manager.gm.events.*;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.jobs.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.*;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class GamingSessionExpirationJobHandler implements JobHandler {
    private static final int BATCH_SIZE = 100;
    private final GamingSessionRepository sessions;
    private final StationCommandWriter commands;
    private final OutboxWriter outbox;
    private final Clock clock;
    private final MeterRegistry metrics;
    public GamingSessionExpirationJobHandler(GamingSessionRepository sessions,
            StationCommandWriter commands, OutboxWriter outbox, Clock clock, MeterRegistry metrics) {
        this.sessions = sessions; this.commands = commands; this.outbox = outbox;
        this.clock = clock; this.metrics = metrics;
    }
    @Override public String type() { return GamingSessionJobTypes.EXPIRATION; }

    @Override @Transactional
    public void handle(JobRecord job, JobContext context) {
        Instant now = clock.instant();
        var due = sessions.findDueForUpdate(GamingSessionStatus.ACTIVE, now, PageRequest.of(0, BATCH_SIZE));
        for (GamingSession session : due) {
            context.checkCancellation();
            if (session.getStatus() != GamingSessionStatus.ACTIVE || session.getEndsAt().isAfter(now)) continue;
            session.setStatus(GamingSessionStatus.EXPIRED); session.setEndedAt(now);
            session = sessions.saveAndFlush(session);
            long sequence = commands.write(session, StationCommandType.SESSION_TERMINATED);
            sessions.saveAndFlush(session);
            outbox.write(DomainEventType.GAMING_SESSION_EXPIRED, "GAMING_SESSION", session.getId(),
                    Map.of("resourceId", session.getResourceId(), "locationId", session.getLocationId(),
                            "endedAt", now, "endsAt", session.getEndsAt(), "commandSequence", sequence));
            metrics.counter("gmanager.gaming.sessions.expired").increment();
        }
        metrics.summary("gmanager.gaming.sessions.expiration.batch").record(due.size());
    }
}
