package com.game_manager.gm.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_ERROR,
    MALFORMED_REQUEST,
    AUTHENTICATION_REQUIRED,
    ACCESS_DENIED,
    RESOURCE_NOT_FOUND,
    CONFLICT,
    RATE_LIMITED,
    PAYLOAD_TOO_LARGE,
    UNPROCESSABLE_REQUEST,
    INTERNAL_ERROR;

    public static ErrorCode from(HttpStatus status) {
        return switch (status) {
            case UNAUTHORIZED -> AUTHENTICATION_REQUIRED;
            case FORBIDDEN -> ACCESS_DENIED;
            case NOT_FOUND -> RESOURCE_NOT_FOUND;
            case CONFLICT -> CONFLICT;
            case TOO_MANY_REQUESTS -> RATE_LIMITED;
            case PAYLOAD_TOO_LARGE -> PAYLOAD_TOO_LARGE;
            case UNPROCESSABLE_ENTITY -> UNPROCESSABLE_REQUEST;
            case INTERNAL_SERVER_ERROR -> INTERNAL_ERROR;
            default -> MALFORMED_REQUEST;
        };
    }
}
