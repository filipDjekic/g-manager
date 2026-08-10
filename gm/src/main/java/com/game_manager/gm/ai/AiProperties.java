package com.game_manager.gm.ai;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.ai")
public record AiProperties(
        @NotBlank String provider, URI endpoint, String apiKey, @NotBlank String model,
        @Positive int timeoutMillis, @Positive int maxInputTokens, @Positive int maxOutputTokens,
        @Positive int dailyTokenLimit, @Min(1) int circuitFailureThreshold,
        @Positive int circuitOpenSeconds, @Positive long metadataRetentionDays) {
    @AssertTrue(message="HTTP AI provider requires HTTPS endpoint and external API key")
    public boolean isProviderConfigurationValid(){return !"http".equalsIgnoreCase(provider)
            || endpoint!=null&&"https".equalsIgnoreCase(endpoint.getScheme())&&apiKey!=null&&!apiKey.isBlank();}
}
