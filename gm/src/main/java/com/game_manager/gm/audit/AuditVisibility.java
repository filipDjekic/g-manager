package com.game_manager.gm.audit;

public enum AuditVisibility {
    MANAGEMENT,
    OWNER_ONLY;

    public static final AuditVisibility ADMIN_ONLY = MANAGEMENT;
}
