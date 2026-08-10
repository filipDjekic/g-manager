package com.game_manager.gm.jobs;

import com.game_manager.gm.events.OutboxOperations;
import org.springframework.stereotype.Component;

@Component
public class OutboxCleanupJobHandler implements JobHandler {
    private final OutboxOperations operations;

    public OutboxCleanupJobHandler(OutboxOperations operations) {
        this.operations = operations;
    }

    @Override
    public String type() {
        return CleanupJobTypes.OUTBOX;
    }

    @Override
    public void handle(JobRecord job, JobContext context) {
        context.checkCancellation();
        operations.applyRetention();
    }
}
