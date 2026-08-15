package com.game_manager.gm.customer;

import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.customers")
public record CustomerOnboardingProperties(@Positive long activationTtlHours) {
}
