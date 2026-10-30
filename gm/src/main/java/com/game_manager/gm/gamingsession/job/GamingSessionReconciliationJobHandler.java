package com.game_manager.gm.gamingsession.job;

import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.jobs.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.data.domain.PageRequest;

@Component
public class GamingSessionReconciliationJobHandler implements JobHandler {
    private final GamingSessionRepository sessions;
    private final StationCommandWriter commands;
    private final StationCommandRepository commandRepository;
    private final MeterRegistry metrics;
    private final Clock clock;
    private final Duration retention;
    private final TransactionTemplate transactions;
    public GamingSessionReconciliationJobHandler(GamingSessionRepository sessions,
            StationCommandWriter commands, StationCommandRepository commandRepository,
            MeterRegistry metrics, Clock clock,
            @Value("${app.gaming-session.command-retention-days:30}") long retentionDays,
            PlatformTransactionManager transactionManager) {
        this.sessions = sessions; this.commands = commands; this.commandRepository = commandRepository;
        this.metrics = metrics; this.clock = clock; this.retention = Duration.ofDays(retentionDays);
        this.transactions = new TransactionTemplate(transactionManager);
    }
    @Override public String type() { return GamingSessionJobTypes.RECONCILIATION; }

    @Override
    public void handle(JobRecord job, JobContext context) {
        int repaired = 0; int inspected = 0;
        UUID cursor = null;
        while (true) {
            context.checkCancellation();
            var ids = sessions.findReconciliationIds(clock.instant().minus(retention), cursor, PageRequest.of(0, 100));
            if (ids.isEmpty()) break;
            for (UUID id : ids) {
                context.checkCancellation(); inspected++;
                if (Boolean.TRUE.equals(transactions.execute(status -> repair(id)))) repaired++;
            }
            cursor = ids.getLast();
            context.heartbeat();
        }
        Long purged = transactions.execute(status ->
                commandRepository.deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(clock.instant()));
        metrics.summary("gmanager.gaming.sessions.reconciliation.inspected").record(inspected);
        metrics.counter("gmanager.gaming.sessions.reconciliation.repaired").increment(repaired);
        metrics.counter("gmanager.gaming.station.commands.purged").increment(purged == null ? 0 : purged);
    }

    private boolean repair(UUID id) {
        // No managed candidate is loaded before the lock: use current committed aggregate state.
        GamingSession session = sessions.findByIdForUpdate(id).orElse(null);
        if (session == null || outsideRetention(session) || commands.matchesCurrentProjection(session)) return false;
        StationCommandType type = session.getStatus() == GamingSessionStatus.ACTIVE
                ? (session.getLastCommandSequence() == null
                    ? StationCommandType.SESSION_STARTED : StationCommandType.SESSION_EXTENDED)
                : StationCommandType.SESSION_TERMINATED;
        commands.write(session, type); sessions.saveAndFlush(session);
        return true;
    }

    private boolean outsideRetention(GamingSession session) {
        return session.getStatus() != GamingSessionStatus.ACTIVE && session.getEndedAt() != null
                && session.getEndedAt().isBefore(clock.instant().minus(retention));
    }
}
