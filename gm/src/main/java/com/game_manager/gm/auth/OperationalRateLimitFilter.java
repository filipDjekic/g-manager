package com.game_manager.gm.auth;

import com.game_manager.gm.common.error.ApiErrorFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Component
@Order(Ordered.LOWEST_PRECEDENCE - 100)
public class OperationalRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> LIMITED_ENDPOINTS =
            Set.of("/api/v1/orders", "/api/v1/reservations");

    private final RateLimitService rateLimitService;
    private final ApiErrorFactory apiErrorFactory;
    private final ObjectMapper objectMapper;

    public OperationalRateLimitFilter(
            RateLimitService rateLimitService,
            ApiErrorFactory apiErrorFactory,
            ObjectMapper objectMapper) {
        this.rateLimitService = rateLimitService;
        this.apiErrorFactory = apiErrorFactory;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !LIMITED_ENDPOINTS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            filterChain.doFilter(request, response);
            return;
        }

        Object principal = authentication.getPrincipal();
        if (!(principal instanceof AuthenticatedUser user)) {
            filterChain.doFilter(request, response);
            return;
        }
        try {
            rateLimitService.checkOperationalCreate(user.id(), request.getRequestURI());
            filterChain.doFilter(request, response);
        } catch (ApplicationException exception) {
            response.setStatus(exception.getStatus().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setHeader(HttpHeaders.RETRY_AFTER, "60");
            objectMapper.writeValue(
                    response.getOutputStream(),
                    apiErrorFactory.create(exception.getStatus(), exception.getMessage(), request));
        }
    }
}
