package com.game_manager.gm.jobs;

public final class CleanupJobTypes {
    public static final String REFRESH_TOKENS = "cleanup.refresh-tokens.v1";
    public static final String IDEMPOTENCY = "cleanup.idempotency.v1";
    public static final String AUDIT = "cleanup.audit.v1";
    public static final String OUTBOX = "cleanup.outbox.v1";

    private CleanupJobTypes() {
    }
}
