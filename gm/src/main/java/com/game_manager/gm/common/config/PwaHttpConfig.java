package com.game_manager.gm.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

@Configuration
public class PwaHttpConfig {
    private static final Set<String> CACHEABLE_READS = Set.of(
            "/api/v1/catalog", "/api/v1/working-hours", "/api/v1/reports/definitions");

    @Bean
    FilterRegistrationBean<ShallowEtagHeaderFilter> pwaEtagFilter() {
        ShallowEtagHeaderFilter filter = new ShallowEtagHeaderFilter() {
            @Override
            protected boolean shouldNotFilter(HttpServletRequest request) {
                return !"GET".equals(request.getMethod()) || CACHEABLE_READS.stream()
                        .noneMatch(path -> request.getRequestURI().equals(path)
                                || request.getRequestURI().startsWith(path + "/"));
            }
        };
        FilterRegistrationBean<ShallowEtagHeaderFilter> registration = new FilterRegistrationBean<>(filter);
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(20);
        return registration;
    }

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> apiMetadataFilter() {
        OncePerRequestFilter filter = new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                    FilterChain chain) throws ServletException, IOException {
                response.setHeader("X-API-Version", "1");
                response.setHeader("Cache-Control", "private, no-store");
                chain.doFilter(request, response);
            }
        };
        FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>(filter);
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(10);
        return registration;
    }
}
