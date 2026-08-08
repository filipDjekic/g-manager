package com.game_manager.gm.auth;

public enum SecurityEventType {
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    TOKEN_REFRESH,
    TOKEN_REUSE,
    SESSION_REVOKED,
    ALL_SESSIONS_REVOKED,
    LOGOUT
}
