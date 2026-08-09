package com.game_manager.gm.common.error;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.Clock;
import java.util.List;

@Component
public class ApiErrorFactory {
    private final Clock clock;

    public ApiErrorFactory(Clock clock) {
        this.clock = clock;
    }

    public ApiError create(HttpStatus status, String message, HttpServletRequest request) {
        return create(status, ErrorCode.from(status), message, List.of(), request);
    }

    public ApiError create(
            HttpStatus status,
            ErrorCode code,
            String message,
            List<ApiFieldError> fieldErrors,
            HttpServletRequest request) {
        return new ApiError(
                clock.instant(),
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI(),
                requestId(request),
                code.name(),
                List.copyOf(fieldErrors)
        );
    }

    private String requestId(HttpServletRequest request) {
        Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        return requestId == null ? "unavailable" : requestId.toString();
    }
}
