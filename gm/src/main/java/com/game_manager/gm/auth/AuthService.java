package com.game_manager.gm.auth;

import com.game_manager.gm.auth.dto.AuthResponse;
import com.game_manager.gm.auth.dto.LoginRequest;
import com.game_manager.gm.auth.dto.RegisterRequest;
import com.game_manager.gm.auth.dto.RegistrationResponse;
import com.game_manager.gm.auth.dto.UserSummary;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.security.JwtService;
import com.game_manager.gm.user.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class AuthService {
    private static final String INVALID_CREDENTIALS = "Invalid email or password";
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenRevocationService revocationService;
    private final Duration refreshTtl;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Clock clock = Clock.systemUTC();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RefreshTokenRevocationService revocationService,
            @Value("${app.jwt.refresh-token-days:14}") long refreshTokenDays
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.revocationService = revocationService;
        this.refreshTtl = Duration.ofDays(refreshTokenDays);
    }

    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Email is already registered");
        }
        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.CUSTOMER);
        user.setActive(true);
        User saved = userRepository.save(user);
        return new RegistrationResponse(saved.getId(), saved.getName(), saved.getEmail(), saved.getRole());
    }

    @Transactional
    public Session login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .filter(User::isActive)
                .orElseThrow(this::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }
        return createSession(user);
    }

    @Transactional
    public Session refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw unauthorizedSession();
        }
        RefreshToken existing = refreshTokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(this::unauthorizedSession);
        if (existing.isRevoked()) {
            revocationService.revokeAllSessions(existing.getUserId());
            throw new ApplicationException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
        }
        if (!existing.getExpiresAt().isAfter(clock.instant())) {
            existing.revoke(null);
            throw unauthorizedSession();
        }
        User user = userRepository.findById(existing.getUserId())
                .filter(User::isActive)
                .orElseThrow(this::unauthorizedSession);

        String newRawToken = generateRefreshToken();
        RefreshToken replacement = refreshTokenRepository.save(
                new RefreshToken(user.getId(), hash(newRawToken), clock.instant().plus(refreshTtl))
        );
        existing.revoke(replacement.getId());
        return response(user, newRawToken);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokenRepository.findByTokenHash(hash(rawToken)).ifPresent(token -> token.revoke(null));
    }

    private Session createSession(User user) {
        String refreshToken = generateRefreshToken();
        refreshTokenRepository.save(
                new RefreshToken(user.getId(), hash(refreshToken), clock.instant().plus(refreshTtl))
        );
        return response(user, refreshToken);
    }

    private Session response(User user, String refreshToken) {
        JwtService.IssuedToken access = jwtService.issue(user.getId());
        return new Session(
                new AuthResponse(access.value(), access.expiresAt(), UserSummary.from(user)),
                refreshToken
        );
    }

    private String generateRefreshToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private ApplicationException invalidCredentials() {
        return new ApplicationException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
    }

    private ApplicationException unauthorizedSession() {
        return new ApplicationException(HttpStatus.UNAUTHORIZED, "Refresh session is not valid");
    }

    public record Session(AuthResponse response, String refreshToken) {
    }
}
