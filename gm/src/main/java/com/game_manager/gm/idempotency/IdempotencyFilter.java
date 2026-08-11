package com.game_manager.gm.idempotency;

import com.game_manager.gm.common.error.ApiErrorFactory;
import com.game_manager.gm.common.security.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class IdempotencyFilter extends OncePerRequestFilter {
    public static final String REPLAY_HEADER = "Idempotency-Replayed";
    private final IdempotencyService idempotencyService;
    private final CanonicalRequestHasher requestHasher;
    private final ApiErrorFactory apiErrorFactory;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !("/api/v1/reservations".equals(request.getRequestURI())
                || "/api/v1/orders".equals(request.getRequestURI())
                || "/api/v1/reservations/recurrence".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String key = request.getHeader("Idempotency-Key");
        if (key == null || key.isBlank()) {
            writeError(request, response, HttpStatus.BAD_REQUEST, "Idempotency-Key header is required");
            return;
        }
        if (key.length() > 255) {
            writeError(request, response, HttpStatus.BAD_REQUEST, "Idempotency-Key is too long");
            return;
        }
        Object principal = SecurityContextHolder.getContext().getAuthentication() == null ? null
                : SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (!(principal instanceof AuthenticatedUser user)) {
            writeError(request, response, HttpStatus.UNAUTHORIZED, "Authentication is required");
            return;
        }

        byte[] body = request.getInputStream().readAllBytes();
        String requestHash;
        try {
            requestHash = requestHasher.hash(body);
        } catch (IOException exception) {
            writeError(request, response, HttpStatus.BAD_REQUEST, "Request body must be valid JSON");
            return;
        }
        String endpoint = request.getMethod() + " " + request.getRequestURI();
        IdempotencyService.ReservationResult result =
                idempotencyService.reserve(user.id(), key, endpoint, requestHash);
        switch (result.outcome()) {
            case DIFFERENT_HASH -> writeError(request, response, HttpStatus.CONFLICT,
                    "Idempotency-Key was already used with a different request");
            case IN_PROGRESS -> {
                response.setHeader(HttpHeaders.RETRY_AFTER, "2");
                writeError(request, response, HttpStatus.TOO_EARLY,
                        "A request with this Idempotency-Key is currently in progress");
            }
            case COMPLETED -> replay(response, result);
            case NEW, EXPIRED_RECOVERED -> executeNew(
                    new CachedBodyHttpServletRequest(request, body), response, chain,
                    user.id(), key, endpoint, result.processingToken());
        }
    }

    private void replay(HttpServletResponse response, IdempotencyService.ReservationResult result)
            throws IOException {
        response.setHeader(REPLAY_HEADER, "true");
        response.setStatus(result.responseStatus());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(result.responseBody());
    }

    private void executeNew(HttpServletRequest request, HttpServletResponse response, FilterChain chain,
                            UUID principalId, String key, String endpoint, UUID processingToken)
            throws IOException, ServletException {
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        wrapped.setHeader(REPLAY_HEADER, "false");
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        try {
            transaction.executeWithoutResult(status -> {
                try {
                    chain.doFilter(request, wrapped);
                    byte[] responseBody = wrapped.getContentAsByteArray();
                    if (wrapped.getStatus() >= 200 && wrapped.getStatus() < 300) {
                        idempotencyService.complete(principalId, key, endpoint, processingToken,
                                wrapped.getStatus(), new String(responseBody, StandardCharsets.UTF_8));
                    } else {
                        idempotencyService.release(principalId, key, endpoint, processingToken);
                    }
                } catch (IOException | ServletException exception) {
                    throw new FilterExecutionException(exception);
                }
            });
        } catch (UnexpectedRollbackException exception) {
            idempotencyService.release(principalId, key, endpoint, processingToken);
        } catch (FilterExecutionException exception) {
            idempotencyService.release(principalId, key, endpoint, processingToken);
            if (exception.getCause() instanceof IOException io) throw io;
            throw (ServletException) exception.getCause();
        } catch (RuntimeException exception) {
            idempotencyService.release(principalId, key, endpoint, processingToken);
            throw exception;
        } finally {
            wrapped.copyBodyToResponse();
        }
    }

    private void writeError(HttpServletRequest request, HttpServletResponse response,
                            HttpStatus status, String message) throws IOException {
        response.setHeader(REPLAY_HEADER, "false");
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), apiErrorFactory.create(status, message, request));
    }

    private static final class FilterExecutionException extends RuntimeException {
        private FilterExecutionException(Exception cause) { super(cause); }
    }
}
