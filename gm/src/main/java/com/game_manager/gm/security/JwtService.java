package com.game_manager.gm.security;

import com.game_manager.gm.common.config.GManagerProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {
    private final SecretKey key;
    private final Duration accessTokenTtl;
    private final Clock clock;

    public JwtService(
            GManagerProperties properties
    ) {
        String secret = properties.jwt().secret();
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("JWT_SECRET must be set and must not be blank");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("JWT_SECRET must contain at least 32 UTF-8 bytes");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenTtl = Duration.ofMinutes(properties.jwt().accessTokenMinutes());
        this.clock = Clock.systemUTC();
    }

    public IssuedToken issue(UUID userId) {
        Instant issuedAt = clock.instant();
        Instant expiresAt = issuedAt.plus(accessTokenTtl);
        String value = Jwts.builder()
                .subject(userId.toString())
                .claim("token_type", "USER")
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(key)
                .compact();
        return new IssuedToken(value, expiresAt);
    }

    public UUID parseUserId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        if (!"USER".equals(claims.get("token_type", String.class))) throw new IllegalArgumentException("Not a user token");
        return UUID.fromString(claims.getSubject());
    }

    public IssuedToken issueMachine(UUID identityId, UUID stationId, long keyVersion) {
        Instant issuedAt = clock.instant(); Instant expiresAt = issuedAt.plus(Duration.ofMinutes(5));
        String value = Jwts.builder().subject(identityId.toString()).audience().add("g-manager-machine").and()
                .claim("token_type", "MACHINE").claim("station_id", stationId.toString())
                .claim("key_version", keyVersion).claim("scope", "MACHINE_PROTOCOL")
                .issuedAt(Date.from(issuedAt)).expiration(Date.from(expiresAt)).signWith(key).compact();
        return new IssuedToken(value, expiresAt);
    }

    public MachineTokenClaims parseMachine(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        if (!"MACHINE".equals(claims.get("token_type", String.class))
                || claims.getAudience() == null || !claims.getAudience().contains("g-manager-machine")
                || !"MACHINE_PROTOCOL".equals(claims.get("scope", String.class)))
            throw new IllegalArgumentException("Not a machine token");
        return new MachineTokenClaims(UUID.fromString(claims.getSubject()),
                UUID.fromString(claims.get("station_id", String.class)),
                ((Number) claims.get("key_version")).longValue());
    }

    public record IssuedToken(String value, Instant expiresAt) {
    }
    public record MachineTokenClaims(UUID identityId, UUID stationId, long keyVersion) {}
}
