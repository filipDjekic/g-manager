package com.game_manager.gm.common.observability;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@RequiredArgsConstructor
public class ListQueryMetricsFilter extends OncePerRequestFilter {
    private static final Map<String, String> RESOURCES = Map.of(
            "/api/v1/catalog", "catalog", "/api/v1/users", "users",
            "/api/v1/reservations", "reservations", "/api/v1/orders", "orders");
    private final MeterRegistry meterRegistry;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String resource = "GET".equals(request.getMethod()) ? RESOURCES.get(request.getRequestURI()) : null;
        if (resource == null) { chain.doFilter(request, response); return; }
        Timer.Sample sample = Timer.start(meterRegistry);
        try { chain.doFilter(request, response); }
        finally { sample.stop(meterRegistry.timer("gm.list.query.duration", "resource", resource)); }
    }
}
