package com.game_manager.gm.notification;
public enum NotificationType {
    SECURITY_SESSION_STARTED(true), SECURITY_PASSWORD_CHANGED(true), RESERVATION_CREATED(false),
    RESERVATION_STATUS_CHANGED(false), ORDER_CREATED(false), ORDER_STATUS_CHANGED(false), REPORT_COMPLETED(false),
    WORKFLOW_ACTION_REQUIRED(false), WORKFLOW_REMINDER(false), WORKFLOW_ESCALATED(false), WORKFLOW_COMPLETED(false);
    private final boolean mandatory;
    NotificationType(boolean mandatory) { this.mandatory = mandatory; }
    public boolean mandatory() { return mandatory; }
}
