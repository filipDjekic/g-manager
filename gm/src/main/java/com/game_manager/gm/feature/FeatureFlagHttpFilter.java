package com.game_manager.gm.feature;

import com.game_manager.gm.common.security.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class FeatureFlagHttpFilter extends OncePerRequestFilter {
    private final FeatureFlagService flags;

    public FeatureFlagHttpFilter(FeatureFlagService flags) {
        this.flags = flags;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        FeatureFlag flag = flagFor(request.getRequestURI());
        if (flag == null || flags.enabled(flag, subject())) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":404,\"message\":\"Feature is not available\"}");
    }

    private FeatureFlag flagFor(String uri) {
        if (uri.equals("/api/v1/reports") || uri.startsWith("/api/v1/reports/")) return FeatureFlag.REPORTS;
        if (uri.equals("/api/v1/workflows") || uri.startsWith("/api/v1/workflows/")) return FeatureFlag.WORKFLOWS;
        return null;
    }

    private UUID subject() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user
                ? user.id() : null;
    }
}
