package com.game_manager.gm.security;

import com.game_manager.gm.common.error.ApiErrorFactory;
import com.game_manager.gm.common.config.GManagerProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import tools.jackson.databind.ObjectMapper;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private final ApiErrorFactory apiErrorFactory;
    private final ObjectMapper objectMapper;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final GManagerProperties properties;

    public SecurityConfig(
            ApiErrorFactory apiErrorFactory,
            ObjectMapper objectMapper,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            GManagerProperties properties
    ) {
        this.apiErrorFactory = apiErrorFactory;
        this.objectMapper = objectMapper;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.properties = properties;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) ->
                                writeError(request, response, HttpStatus.UNAUTHORIZED, "Authentication is required"))
                        .accessDeniedHandler((request, response, exception) ->
                                writeError(request, response, HttpStatus.FORBIDDEN, "Access is denied")))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/actuator/metrics/**").hasAuthority("METRICS_READ")
                        .requestMatchers(HttpMethod.GET, "/media/**").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/auth/register",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me").hasAuthority("PROFILE_READ")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/users/me", "/api/v1/users/me/password")
                            .hasAuthority("PROFILE_UPDATE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/users/me/avatar").hasAuthority("PROFILE_UPDATE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/employees").hasAuthority("EMPLOYEE_LIST")
                        .requestMatchers(HttpMethod.GET, "/api/v1/users").hasAuthority("USER_LIST")
                        .requestMatchers(HttpMethod.POST, "/api/v1/users").hasAuthority("USER_CREATE")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/users/*/deactivate").hasAuthority("USER_DEACTIVATE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/catalog/**").hasAuthority("CATALOG_READ")
                        .requestMatchers("/api/v1/catalog/**").hasAuthority("CATALOG_MANAGE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/working-hours/**").hasAuthority("WORKING_HOURS_READ")
                        .requestMatchers("/api/v1/working-hours/**").hasAuthority("WORKING_HOURS_MANAGE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/reservations").hasAuthority("RESERVATION_CREATE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/reservations/me").hasAuthority("RESERVATION_READ_OWN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/reservations").hasAuthority("RESERVATION_READ_ALL")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/reservations/*/status")
                            .hasAuthority("RESERVATION_CHANGE_STATUS")
                        .requestMatchers(HttpMethod.POST, "/api/v1/orders").hasAuthority("ORDER_CREATE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/orders/me").hasAuthority("ORDER_READ_OWN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/orders").hasAuthority("ORDER_READ_ALL")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/orders/*/status")
                            .hasAuthority("ORDER_CHANGE_STATUS")
                        .requestMatchers(HttpMethod.GET, "/api/v1/dashboard/summary").hasAuthority("DASHBOARD_SUMMARY")
                        .requestMatchers(HttpMethod.GET, "/api/v1/dashboard/today").hasAuthority("DASHBOARD_OPERATIONAL")
                        .anyRequest().denyAll())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .headers(headers -> headers
                        .contentTypeOptions(contentType -> {})
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(
                                org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .permissionsPolicyHeader(permissions ->
                                permissions.policy("camera=(), microphone=(), geolocation=()")))
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    private CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.corsAllowedOrigins());
        configuration.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(java.util.List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"));
        configuration.setExposedHeaders(java.util.List.of("X-Request-Id"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    private void writeError(
            jakarta.servlet.http.HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse response,
            HttpStatus status,
            String message
    ) throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), apiErrorFactory.create(status, message, request));
    }
}
