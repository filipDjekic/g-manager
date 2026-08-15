package com.game_manager.gm.auth;

import com.game_manager.gm.auth.dto.AuthResponse;
import com.game_manager.gm.auth.dto.LoginRequest;
import com.game_manager.gm.auth.dto.UserSummary;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.security.JwtService;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
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
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.support.TransactionTemplate;
import com.game_manager.gm.auth.dto.SessionResponse;
import com.game_manager.gm.auth.dto.SecurityEventResponse;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.events.DomainEventType;
import com.game_manager.gm.events.OutboxWriter;
import java.util.Map;

@Service
public class AuthService {
    private static final String INVALID_CREDENTIALS = "Invalid email or password";
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenRevocationService revocationService;
    private final SecurityEventRepository securityEventRepository;
    private final SecurityEventRecorder securityEventRecorder;
    private final CurrentUserProvider currentUserProvider;
    private final TransactionTemplate transactionTemplate;
    private final Duration refreshTtl;
    private final OutboxWriter outboxWriter;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Clock clock = Clock.systemUTC();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RefreshTokenRevocationService revocationService,
            SecurityEventRepository securityEventRepository,
            SecurityEventRecorder securityEventRecorder,
            CurrentUserProvider currentUserProvider,
            org.springframework.transaction.PlatformTransactionManager transactionManager,
            GManagerProperties properties,
            OutboxWriter outboxWriter
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.revocationService = revocationService;
        this.securityEventRepository = securityEventRepository;
        this.securityEventRecorder = securityEventRecorder;
        this.currentUserProvider = currentUserProvider;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.refreshTtl = Duration.ofDays(properties.jwt().refreshTokenDays());
        this.outboxWriter = outboxWriter;
    }

    @Transactional
    public Session login(LoginRequest request, SessionRequestMetadata metadata) {
        User user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .filter(User::isActive)
                .filter(value -> !value.isMustChangePassword())
                .orElse(null);
        if (user == null) {
            securityEventRecorder.record(null, null, SecurityEventType.LOGIN_FAILURE, metadata);
            throw invalidCredentials();
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            securityEventRecorder.record(user.getId(), null, SecurityEventType.LOGIN_FAILURE, metadata);
            throw invalidCredentials();
        }
        Session session = createSession(user, metadata);
        outboxWriter.write(DomainEventType.AUTH_SESSION_STARTED, "USER", user.getId(),
                Map.of("sessionId", session.sessionId().toString()));
        securityEventRecorder.record(user.getId(), session.sessionId(),
                SecurityEventType.LOGIN_SUCCESS, metadata);
        return session;
    }

    public Session refresh(String rawToken, SessionRequestMetadata metadata) {
        if (rawToken == null || rawToken.isBlank()) {
            throw unauthorizedSession();
        }
        RotationResult result = transactionTemplate.execute(status -> rotate(rawToken, metadata));
        if (result == null || result.status() == RotationStatus.INVALID) throw unauthorizedSession();
        if (result.status() == RotationStatus.REUSED) {
            throw new ApplicationException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
        }
        return result.session();
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokenRepository.findByTokenHash(hash(rawToken)).ifPresent(token -> {
            token.revoke(null);
            securityEventRepository.save(new SecurityEvent(token.getUserId(), token.getSessionId(),
                    SecurityEventType.LOGOUT, token.getDeviceLabel(), token.getIpHash()));
            outboxWriter.write(DomainEventType.AUTH_SESSION_ENDED, "USER", token.getUserId(),
                    Map.of("scope", "CURRENT"));
        });
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> sessions(String rawCurrentToken) {
        UUID userId = currentUserProvider.requireCurrentUser().id();
        String currentHash = rawCurrentToken == null ? null : hash(rawCurrentToken);
        return refreshTokenRepository
                .findAllByUserIdAndRevokedFalseAndExpiresAtAfterOrderByLastSeenAtDesc(userId, clock.instant())
                .stream().map(token -> new SessionResponse(token.getId(), token.getDeviceLabel(),
                        token.getUserAgentSummary(), token.getCreatedAt(), token.getLastSeenAt(),
                        token.getExpiresAt(), MessageDigest.isEqual(
                                token.getTokenHash().getBytes(StandardCharsets.UTF_8),
                                currentHash == null ? new byte[0] : currentHash.getBytes(StandardCharsets.UTF_8))))
                .toList();
    }

    @Transactional
    public boolean revokeSession(UUID tokenId, String rawCurrentToken) {
        UUID userId = currentUserProvider.requireCurrentUser().id();
        RefreshToken token = refreshTokenRepository.findByIdAndUserId(tokenId, userId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Session was not found"));
        boolean current = rawCurrentToken != null && refreshTokenRepository.findByTokenHash(hash(rawCurrentToken))
                .map(active -> active.getSessionId().equals(token.getSessionId())).orElse(false);
        refreshTokenRepository.revokeAllBySessionId(token.getSessionId());
        securityEventRepository.save(new SecurityEvent(userId, token.getSessionId(),
                SecurityEventType.SESSION_REVOKED, token.getDeviceLabel(), token.getIpHash()));
        outboxWriter.write(DomainEventType.AUTH_SESSION_ENDED, "USER", userId,
                Map.of("scope", current ? "CURRENT" : "SELECTED"));
        return current;
    }

    @Transactional
    public void revokeAllSessions() {
        UUID userId = currentUserProvider.requireCurrentUser().id();
        revocationService.revokeAllSessionsInCurrentTransaction(userId);
        securityEventRepository.save(new SecurityEvent(userId, null,
                SecurityEventType.ALL_SESSIONS_REVOKED, "All devices", zeroIpHash()));
        outboxWriter.write(DomainEventType.AUTH_SESSION_ENDED, "USER", userId,
                Map.of("scope", "ALL"));
    }

    @Transactional(readOnly = true)
    public List<SecurityEventResponse> securityEvents() {
        UUID userId = currentUserProvider.requireCurrentUser().id();
        return securityEventRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50))
                .stream().map(event -> new SecurityEventResponse(event.getEventType(),
                        event.getDeviceLabel(), event.getCreatedAt())).toList();
    }

    private Session createSession(User user, SessionRequestMetadata metadata) {
        String refreshToken = generateRefreshToken();
        UUID sessionId = UUID.randomUUID();
        RefreshToken saved = refreshTokenRepository.save(new RefreshToken(user.getId(), sessionId,
                hash(refreshToken), clock.instant().plus(refreshTtl), metadata.deviceLabel(),
                metadata.userAgentSummary(), metadata.ipHash(), clock.instant()));
        return response(user, refreshToken, saved.getSessionId());
    }

    private Session response(User user, String refreshToken, UUID sessionId) {
        JwtService.IssuedToken access = jwtService.issue(user.getId());
        return new Session(
                new AuthResponse(access.value(), access.expiresAt(), UserSummary.from(user)),
                refreshToken,
                sessionId
        );
    }

    private RotationResult rotate(String rawToken, SessionRequestMetadata metadata) {
        RefreshToken existing = refreshTokenRepository.findByTokenHashForUpdate(hash(rawToken)).orElse(null);
        if (existing == null) return new RotationResult(RotationStatus.INVALID, null);
        if (existing.isRevoked()) {
            refreshTokenRepository.revokeAllBySessionId(existing.getSessionId());
            securityEventRepository.save(new SecurityEvent(existing.getUserId(), existing.getSessionId(),
                    SecurityEventType.TOKEN_REUSE, existing.getDeviceLabel(), metadata.ipHash()));
            return new RotationResult(RotationStatus.REUSED, null);
        }
        Instant now = clock.instant();
        if (!existing.getExpiresAt().isAfter(now)) {
            existing.revoke(null);
            return new RotationResult(RotationStatus.INVALID, null);
        }
        User user = userRepository.findById(existing.getUserId()).filter(User::isActive).orElse(null);
        if (user == null) {
            refreshTokenRepository.revokeAllBySessionId(existing.getSessionId());
            return new RotationResult(RotationStatus.INVALID, null);
        }
        String newRawToken = generateRefreshToken();
        Instant seenAt = existing.getLastSeenAt().plus(Duration.ofMinutes(5)).isBefore(now)
                ? now : existing.getLastSeenAt();
        RefreshToken replacement = refreshTokenRepository.save(new RefreshToken(user.getId(),
                existing.getSessionId(), hash(newRawToken), now.plus(refreshTtl), existing.getDeviceLabel(),
                existing.getUserAgentSummary(), metadata.ipHash(), seenAt));
        existing.revoke(replacement.getId());
        securityEventRepository.save(new SecurityEvent(user.getId(), existing.getSessionId(),
                SecurityEventType.TOKEN_REFRESH, existing.getDeviceLabel(), metadata.ipHash()));
        return new RotationResult(RotationStatus.SUCCESS,
                response(user, newRawToken, existing.getSessionId()));
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

    private String zeroIpHash() { return "0".repeat(64); }

    public record Session(AuthResponse response, String refreshToken, UUID sessionId) {
    }

    private enum RotationStatus { SUCCESS, INVALID, REUSED }
    private record RotationResult(RotationStatus status, Session session) {}
}
