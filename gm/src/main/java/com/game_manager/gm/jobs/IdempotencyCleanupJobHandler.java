package com.game_manager.gm.jobs;

import com.game_manager.gm.idempotency.IdempotencyService;
import org.springframework.stereotype.Component;

@Component
public class IdempotencyCleanupJobHandler implements JobHandler {
    private final IdempotencyService service;

    public IdempotencyCleanupJobHandler(IdempotencyService service) {
        this.service = service;
    }

    @Override
    public String type() {
        return CleanupJobTypes.IDEMPOTENCY;
    }

    @Override
    public void handle(JobRecord job, JobContext context) {
        context.checkCancellation();
        service.cleanupExpired();
    }
}
