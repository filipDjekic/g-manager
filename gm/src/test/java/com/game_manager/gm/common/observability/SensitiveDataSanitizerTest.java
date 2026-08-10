package com.game_manager.gm.common.observability;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SensitiveDataSanitizerTest {
    @Test
    void removesSecretsTokensAndPersonalData() {
        String secret = "stage13-test-secret";
        String sanitized = SensitiveDataSanitizer.redact(
                "password=" + secret + " Authorization:Bearer abc.def.ghi user@example.com");

        assertThat(sanitized)
                .doesNotContain(secret, "abc.def.ghi", "user@example.com")
                .contains("[REDACTED]", "[REDACTED_EMAIL]");
    }
}
