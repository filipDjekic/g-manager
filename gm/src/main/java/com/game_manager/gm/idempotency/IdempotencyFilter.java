package com.game_manager.gm.idempotency;

import com.game_manager.gm.common.error.ApiErrorFactory;
import com.game_manager.gm.common.error.RequestIdFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class IdempotencyFilter extends OncePerRequestFilter {
    private final IdempotencyService idempotencyService;
    private final ApiErrorFactory apiErrorFactory;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !("/api/v1/reservations".equals(request.getRequestURI())
                || "/api/v1/orders".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String key = request.getHeader("Idempotency-Key");
        if (key == null || key.isBlank()) {
            writeError(request, response, HttpStatus.BAD_REQUEST,
                    "Idempotency-Key header is required");
            return;
        }
        if (key.length() > 255) {
            writeError(request, response, HttpStatus.BAD_REQUEST,
                    "Idempotency-Key is too long");
            return;
        }

        byte[] body = request.getInputStream().readAllBytes();
        String endpoint = request.getMethod() + " " + request.getRequestURI();
        String requestHash = sha256(body);
        IdempotencyService.ReservationResult result =
                idempotencyService.reserve(key, endpoint, requestHash);
        switch (result.outcome()) {
            case DIFFERENT_HASH -> writeError(
                    request, response, HttpStatus.CONFLICT,
                    "Idempotency-Key was already used with a different request");
            case IN_PROGRESS -> writeError(
                    request, response, HttpStatus.CONFLICT,
                    "A request with this Idempotency-Key is currently in progress");
            case COMPLETED -> {
                response.setStatus(result.responseStatus());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write(result.responseBody());
            }
            case NEW -> executeNew(
                    new CachedBodyHttpServletRequest(request, body), response, chain, key, endpoint);
        }
    }

    private void executeNew(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain,
            String key,
            String endpoint) throws IOException, ServletException {
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        try {
            chain.doFilter(request, wrapped);
            byte[] responseBody = wrapped.getContentAsByteArray();
            if (wrapped.getStatus() >= 200 && wrapped.getStatus() < 300) {
                idempotencyService.complete(
                        key, endpoint, wrapped.getStatus(),
                        new String(responseBody, StandardCharsets.UTF_8));
            } else {
                idempotencyService.release(key, endpoint);
            }
        } catch (RuntimeException | ServletException | IOException exception) {
            idempotencyService.release(key, endpoint);
            throw exception;
        } finally {
            wrapped.copyBodyToResponse();
        }
    }

    private String sha256(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private void writeError(
            HttpServletRequest request,
            HttpServletResponse response,
            HttpStatus status,
            String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(
                response.getOutputStream(), apiErrorFactory.create(status, message, request));
    }
}
