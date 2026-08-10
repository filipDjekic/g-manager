package com.game_manager.gm.security;

import com.game_manager.gm.common.config.GManagerProperties;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    @Test
    void createsAndVerifiesTokenWithValidPlainTextSecret() {
        JwtService service =
                new JwtService(properties("test-secret-with-at-least-32-utf8-bytes"));
        UUID userId = UUID.randomUUID();

        String token = service.issue(userId).value();

        assertThat(service.parseUserId(token)).isEqualTo(userId);
    }

    @Test
    void rejectsBlankOrShortSecretWithClearStartupError() {
        assertThatThrownBy(() -> new JwtService(properties(" ")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("JWT_SECRET must be set and must not be blank");

        assertThatThrownBy(() -> new JwtService(properties("too-short")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("JWT_SECRET must contain at least 32 UTF-8 bytes");
    }

    private static GManagerProperties properties(String secret) {
        return new GManagerProperties(
                java.time.ZoneId.of("Europe/Belgrade"),
                java.util.List.of("http://localhost:5173"),
                new GManagerProperties.Storage(java.nio.file.Path.of("target/test-uploads")),
                new GManagerProperties.Idempotency(24, "0 0 3 * * *", 120),
                new GManagerProperties.Outbox(false, 10, 1000, 30, 3, 2, 30),
                new GManagerProperties.Jobs(false, 2, 4, 2, 1000, 30, 60,
                        3, 2, 10, 30, 365),
                new GManagerProperties.Reservations(60),
                new GManagerProperties.Jwt(secret, 15, 14, false),
                new GManagerProperties.InitialOwner("Initial Owner", "", ""));
    }
}
