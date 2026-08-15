package com.game_manager.gm.gamingsession.job;

import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.jobs.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class GamingSessionReconciliationJobHandler implements JobHandler {
    private final GamingSessionRepository sessions;
    private final StationCommandWriter commands;
    private final StationCommandRepository commandRepository;
    private final MeterRegistry metrics;
    private final Clock clock;
    private final Duration retention;
    public GamingSessionReconciliationJobHandler(GamingSessionRepository sessions,
            StationCommandWriter commands, StationCommandRepository commandRepository,
            MeterRegistry metrics, Clock clock,
            @Value("${app.gaming-session.command-retention-days:30}") long retentionDays) {
        this.sessions = sessions; this.commands = commands; this.commandRepository = commandRepository;
        this.metrics = metrics; this.clock = clock; this.retention = Duration.ofDays(retentionDays);
    }
    @Override public String type() { return GamingSessionJobTypes.RECONCILIATION; }

    @Override @Transactional
    public void handle(JobRecord job, JobContext context) {
        int repaired = 0; int inspected = 0;
        for (GamingSession candidate : sessions.findAll()) {
            context.checkCancellation(); inspected++;
            GamingSession session = sessions.findByIdForUpdate(candidate.getId()).orElse(null);
            if (session == null || outsideRetention(session) || commands.matchesCurrentProjection(session)) continue;
            StationCommandType type = session.getStatus() == GamingSessionStatus.ACTIVE
                    ? (session.getLastCommandSequence() == null
                        ? StationCommandType.SESSION_STARTED : StationCommandType.SESSION_EXTENDED)
                    : StationCommandType.SESSION_TERMINATED;
            commands.write(session, type); sessions.saveAndFlush(session); repaired++;
        }
        long purged = commandRepository.deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(clock.instant());
        metrics.summary("gmanager.gaming.sessions.reconciliation.inspected").record(inspected);
        metrics.counter("gmanager.gaming.sessions.reconciliation.repaired").increment(repaired);
        metrics.counter("gmanager.gaming.station.commands.purged").increment(purged);
    }

    private boolean outsideRetention(GamingSession session) {
        return session.getStatus() != GamingSessionStatus.ACTIVE && session.getEndedAt() != null
                && session.getEndedAt().isBefore(clock.instant().minus(retention));
    }
}
