package com.game_manager.gm.common.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.validation.annotation.Validated;

@Profile("prod")
@Validated
@ConfigurationProperties("app.production")
public record ProductionProperties(
        @NotBlank String canonicalOrigin,
        @NotBlank String release,
        @NotBlank String trustedProxyRegex
) {
    @AssertTrue(message = "production canonical origin must be an HTTPS origin without path, query or fragment")
    public boolean isSecureCanonicalOrigin() {
        try {
            URI value = URI.create(canonicalOrigin);
            return "https".equalsIgnoreCase(value.getScheme()) && value.getHost() != null
                    && (value.getPath() == null || value.getPath().isEmpty())
                    && value.getQuery() == null && value.getFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
}
