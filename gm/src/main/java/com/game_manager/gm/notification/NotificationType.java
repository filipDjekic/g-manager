package com.game_manager.gm.notification;
public enum NotificationType {
    SECURITY_SESSION_STARTED(true), SECURITY_PASSWORD_CHANGED(true), RESERVATION_CREATED(false),
    RESERVATION_STATUS_CHANGED(false), ORDER_CREATED(false), ORDER_STATUS_CHANGED(false), REPORT_COMPLETED(false),
    // Retained only to read existing notifications and preferences without rewriting stored data.
    WORKFLOW_ACTION_REQUIRED(false, true), WORKFLOW_REMINDER(false, true),
    WORKFLOW_ESCALATED(false, true), WORKFLOW_COMPLETED(false, true),
    WAITLIST_OFFERED(false), WAITLIST_CANCELLED(false);
    private final boolean mandatory;
    private final boolean retired;
    NotificationType(boolean mandatory) { this(mandatory, false); }
    NotificationType(boolean mandatory, boolean retired) { this.mandatory = mandatory; this.retired = retired; }
    public boolean mandatory() { return mandatory; }
    public boolean retired() { return retired; }
}
