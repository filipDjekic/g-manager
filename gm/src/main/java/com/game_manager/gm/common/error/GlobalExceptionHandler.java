package com.game_manager.gm.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import java.util.List;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ApiErrorFactory apiErrorFactory;

    public GlobalExceptionHandler(ApiErrorFactory apiErrorFactory) {
        this.apiErrorFactory = apiErrorFactory;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<ApiFieldError> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiFieldError(
                        error.getField(),
                        error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage()))
                .distinct()
                .toList();
        return response(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR,
                "Request validation failed", fieldErrors, request);
    }

    @ExceptionHandler(ApplicationException.class)
    ResponseEntity<ApiError> handleApplication(ApplicationException exception, HttpServletRequest request) {
        return response(exception.getStatus(), exception.getMessage(), request);
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    ResponseEntity<ApiError> handleAccessDenied(org.springframework.security.access.AccessDeniedException exception,
            HttpServletRequest request) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean authenticated = new AuthenticationTrustResolverImpl().isAuthenticated(authentication);
        return authenticated
                ? response(HttpStatus.FORBIDDEN, ErrorCode.ACCESS_DENIED, "Access is denied", List.of(), request)
                : response(HttpStatus.UNAUTHORIZED, ErrorCode.AUTHENTICATION_REQUIRED,
                        "Authentication is required", List.of(), request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ApiError> handleOptimisticLock(
            OptimisticLockingFailureException exception, HttpServletRequest request) {
        return response(
                HttpStatus.CONFLICT,
                "Resource was changed; refresh and try again",
                request);
    }

    @ExceptionHandler(org.springframework.dao.PessimisticLockingFailureException.class)
    ResponseEntity<ApiError> handleConcurrentBooking(
            org.springframework.dao.PessimisticLockingFailureException exception, HttpServletRequest request) {
        return response(HttpStatus.CONFLICT, "Booking availability changed; refresh and try again", request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> handleDataIntegrity(
            DataIntegrityViolationException exception, HttpServletRequest request) {
        return response(
                HttpStatus.CONFLICT,
                "The request conflicts with existing data",
                request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> handleUploadLimit(
            MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return response(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "Uploaded file exceeds the allowed size",
                request);
    }

    @ExceptionHandler({
            ConstraintViolationException.class,
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    ResponseEntity<ApiError> handleMalformedRequest(Exception exception, HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, "Request is not valid", request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
        logUnexpected(exception, request);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred", request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ApiError> handleAuthentication(AuthenticationException exception, HttpServletRequest request) {
        return response(HttpStatus.UNAUTHORIZED, ErrorCode.AUTHENTICATION_REQUIRED,
                "Authentication is required", List.of(), request);
    }

    static void logUnexpected(Exception exception, HttpServletRequest request) {
        log.error("Unexpected request failure [requestId={}, method={}, uri={}, type={}]\n{}",
                request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE),
                request.getMethod(), request.getRequestURI().replace('\r', '_').replace('\n', '_'),
                exception.getClass().getName(), diagnosticStack(exception));
    }

    // Exception messages can contain submitted credentials or database values. Retain every frame,
    // cause and suppressed exception type without copying those messages into the log.
    static String diagnosticStack(Throwable exception) {
        StringBuilder output = new StringBuilder();
        appendStack(exception, "", output, java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>()));
        return output.toString();
    }

    private static void appendStack(Throwable exception, String prefix, StringBuilder output,
            java.util.Set<Throwable> seen) {
        output.append(prefix).append(exception.getClass().getName()).append('\n');
        if (!seen.add(exception)) {
            output.append("[circular reference]\n");
            return;
        }
        for (StackTraceElement frame : exception.getStackTrace())
            output.append("\tat ").append(frame).append('\n');
        for (Throwable suppressed : exception.getSuppressed())
            appendStack(suppressed, "Suppressed: ", output, seen);
        if (exception.getCause() != null) appendStack(exception.getCause(), "Caused by: ", output, seen);
    }
    private ResponseEntity<ApiError> response(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(apiErrorFactory.create(status, message, request));
    }

    private ResponseEntity<ApiError> response(
            HttpStatus status,
            ErrorCode code,
            String message,
            List<ApiFieldError> fieldErrors,
            HttpServletRequest request) {
        return ResponseEntity.status(status).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(apiErrorFactory.create(status, code, message, fieldErrors, request));
    }
}
