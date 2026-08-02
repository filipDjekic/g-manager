package com.game_manager.gm.security;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    @Test
    void createsAndVerifiesTokenWithValidPlainTextSecret() {
        JwtService service =
                new JwtService("test-secret-with-at-least-32-utf8-bytes", 15);
        UUID userId = UUID.randomUUID();

        String token = service.issue(userId).value();

        assertThat(service.parseUserId(token)).isEqualTo(userId);
    }

    @Test
    void rejectsBlankOrShortSecretWithClearStartupError() {
        assertThatThrownBy(() -> new JwtService(" ", 15))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("JWT_SECRET must be set and must not be blank");

        assertThatThrownBy(() -> new JwtService("too-short", 15))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("JWT_SECRET must contain at least 32 UTF-8 bytes");
    }
}
