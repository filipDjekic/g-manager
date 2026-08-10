package com.game_manager.gm.notification;
public enum NotificationType {
    SECURITY_SESSION_STARTED(true), SECURITY_PASSWORD_CHANGED(true), RESERVATION_CREATED(false),
    RESERVATION_STATUS_CHANGED(false), ORDER_CREATED(false), ORDER_STATUS_CHANGED(false);
    private final boolean mandatory;
    NotificationType(boolean mandatory) { this.mandatory = mandatory; }
    public boolean mandatory() { return mandatory; }
}
