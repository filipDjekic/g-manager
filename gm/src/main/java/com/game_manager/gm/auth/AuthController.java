package com.game_manager.gm.auth;

import com.game_manager.gm.auth.dto.AuthResponse;
import com.game_manager.gm.auth.dto.LoginRequest;
import com.game_manager.gm.auth.dto.ActivateCustomerRequest;
import com.game_manager.gm.auth.dto.SessionResponse;
import com.game_manager.gm.auth.dto.SecurityEventResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.customer.CustomerAccountService;
import com.game_manager.gm.customer.CustomerActivationGuard;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.web.csrf.CsrfToken;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    static final String REFRESH_COOKIE = "gm_refresh";
    private final AuthService authService;
    private final RateLimitService rateLimitService;
    private final SessionMetadataFactory metadataFactory;
    private final boolean secureCookie;
    private final Duration refreshTtl;
    private final CustomerAccountService customerAccountService;
    private final CustomerActivationGuard activationGuard;
    private final SecurityEventRecorder securityEvents;

    public AuthController(
            AuthService authService,
            RateLimitService rateLimitService,
            SessionMetadataFactory metadataFactory,
            GManagerProperties properties,
            CustomerAccountService customerAccountService,
            CustomerActivationGuard activationGuard,
            SecurityEventRecorder securityEvents
    ) {
        this.authService = authService;
        this.rateLimitService = rateLimitService;
        this.metadataFactory = metadataFactory;
        this.secureCookie = properties.jwt().secureCookie();
        this.refreshTtl = Duration.ofDays(properties.jwt().refreshTokenDays());
        this.customerAccountService = customerAccountService;
        this.activationGuard = activationGuard;
        this.securityEvents = securityEvents;
    }

    @GetMapping("/csrf")
    ResponseEntity<Map<String, String>> csrf(CsrfToken csrfToken) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(Map.of("token", csrfToken.getToken()));
    }

    @PostMapping("/activate")
    ResponseEntity<Void> activate(@Valid @RequestBody ActivateCustomerRequest request,
            HttpServletRequest servletRequest) {
        if (!activationGuard.reserveAttempt(clientIp(servletRequest), request.email())) {
            throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
        }
        SessionRequestMetadata metadata = metadataFactory.from(servletRequest);
        try {
            customerAccountService.activate(request.email(), request.activationSecret(), request.password(),
                    metadata.ipHash());
        } catch (ApplicationException exception) {
            if (exception.getStatus() == HttpStatus.BAD_REQUEST) {
                securityEvents.record(null, null, SecurityEventType.ACTIVATION_FAILURE, metadata);
            }
            throw exception;
        }
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @Hidden
    @PostMapping("/register")
    ResponseEntity<Void> rejectPublicRegistration() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping("/login")
    AuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        rateLimitService.checkLogin(clientIp(servletRequest), request.email());
        AuthService.Session session = authService.login(request, metadataFactory.from(servletRequest));
        setRefreshCookie(servletResponse, session.refreshToken(), refreshTtl);
        return session.response();
    }

    @PostMapping("/refresh")
    AuthResponse refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        try {
            AuthService.Session session = authService.refresh(refreshToken, metadataFactory.from(request));
            setRefreshCookie(response, session.refreshToken(), refreshTtl);
            return session.response();
        } catch (ApplicationException exception) {
            setRefreshCookie(response, "", Duration.ZERO);
            throw exception;
        }
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
            HttpServletResponse response
    ) {
        authService.logout(refreshToken);
        setRefreshCookie(response, "", Duration.ZERO);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions")
    List<SessionResponse> sessions(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken
    ) {
        return authService.sessions(refreshToken);
    }

    @GetMapping({"/security-events","/security-events/page"})
    com.game_manager.gm.common.dto.PageResponse<SecurityEventResponse> securityEventPage(@org.springframework.web.bind.annotation.RequestParam(defaultValue="all")String filter,@org.springframework.web.bind.annotation.RequestParam(defaultValue="0")int page,@org.springframework.web.bind.annotation.RequestParam(defaultValue="20")int size){return authService.securityEventPage(filter,page,size);}

    @GetMapping("/security-events/recent")
    List<SecurityEventResponse> securityEvents() {
        return authService.securityEvents();
    }

    @DeleteMapping("/sessions/{id}")
    ResponseEntity<Void> revokeSession(
            @PathVariable UUID id,
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
            HttpServletResponse response
    ) {
        if (authService.revokeSession(id, refreshToken)) {
            setRefreshCookie(response, "", Duration.ZERO);
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/sessions")
    ResponseEntity<Void> revokeAllSessions(HttpServletResponse response) {
        authService.revokeAllSessions();
        setRefreshCookie(response, "", Duration.ZERO);
        return ResponseEntity.noContent().build();
    }

    private void setRefreshCookie(HttpServletResponse response, String value, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Strict")
                .path("/api/v1/auth")
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }
}
