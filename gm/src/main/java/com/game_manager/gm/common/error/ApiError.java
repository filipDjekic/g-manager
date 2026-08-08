package com.game_manager.gm.common.error;

import java.time.Instant;
import java.util.List;

public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        String requestId,
        String code,
        List<ApiFieldError> fieldErrors
) {
}
