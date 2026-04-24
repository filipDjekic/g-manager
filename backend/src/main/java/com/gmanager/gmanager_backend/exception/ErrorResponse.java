package com.gmanager.gmanager_backend.exception;

import java.time.LocalDateTime;

public record ErrorResponse (int status, String message, LocalDateTime timestamp) {
}
