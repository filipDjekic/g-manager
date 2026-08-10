package com.game_manager.gm.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

class ProductionPropertiesTest {
    @Test
    void acceptsHttpsOriginAndRejectsInsecureOrPathBasedOrigin() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        assertThat(validator.validate(new ProductionProperties(
                "https://gmanager.example", "sha-123", "10\\..*"))).isEmpty();
        assertThat(validator.validate(new ProductionProperties(
                "http://gmanager.example/path", "sha-123", "10\\..*"))).isNotEmpty();
    }

    @Test
    void s3BackendRequiresExternalCredentials() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        assertThat(validator.validate(new GManagerProperties.Documents(
                1024, 10, 30, "s3", "", "us-east-1", "", "", ""))).isNotEmpty();
    }
}
