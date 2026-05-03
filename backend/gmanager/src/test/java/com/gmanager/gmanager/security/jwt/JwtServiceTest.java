package com.gmanager.gmanager.security.jwt;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    @Test
    void shouldGenerateAndValidateToken() {
        JwtService jwtService = new JwtService(
                "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_KEY_AT_LEAST_32_CHARS",
                3600000
        );

        UserDetails userDetails = User
                .withUsername("admin@gmanager.com")
                .password("password")
                .roles("OWNER")
                .build();

        String token = jwtService.generateToken(userDetails);

        assertThat(token).isNotBlank();
        assertThat(jwtService.extractUsername(token)).isEqualTo("admin@gmanager.com");
        assertThat(jwtService.isTokenValid(token, userDetails)).isTrue();
    }
}