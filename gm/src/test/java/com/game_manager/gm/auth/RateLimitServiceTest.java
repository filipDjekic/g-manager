package com.game_manager.gm.auth;

import com.game_manager.gm.common.error.ApplicationException;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimitServiceTest {

    @Test
    void limitsLoginByIpAndEmailToFiveAttempts() {
        RateLimitService service = new RateLimitService(Clock.systemUTC());
        for (int attempt = 0; attempt < 5; attempt++) {
            service.checkLogin("127.0.0.1", "limited@example.com");
        }

        assertThatThrownBy(() -> service.checkLogin("127.0.0.1", "limited@example.com"))
                .isInstanceOf(ApplicationException.class)
                .extracting("status")
                .isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void limitsRegistrationsByIpToTenPerHour() {
        RateLimitService service = new RateLimitService(Clock.systemUTC());
        for (int attempt = 0; attempt < 10; attempt++) {
            service.checkRegistration("192.0.2.1");
        }

        assertThatThrownBy(() -> service.checkRegistration("192.0.2.1"))
                .isInstanceOf(ApplicationException.class)
                .extracting("status")
                .isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void limitsOperationalCreatesByUserAndEndpointToThirtyPerMinute() {
        RateLimitService service = new RateLimitService(Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        for (int attempt = 0; attempt < 30; attempt++) {
            service.checkOperationalCreate(userId, "/api/v1/orders");
        }

        assertThatThrownBy(() -> service.checkOperationalCreate(userId, "/api/v1/orders"))
                .isInstanceOf(ApplicationException.class)
                .extracting("status")
                .isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);

        service.checkOperationalCreate(userId, "/api/v1/reservations");
        service.checkOperationalCreate(UUID.randomUUID(), "/api/v1/orders");
    }

    @Test
    void limitsSearchesPerAuthenticatedUserToSixtyPerMinute() {
        RateLimitService service = new RateLimitService(Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        for (int attempt = 0; attempt < 60; attempt++) {
            service.checkSearch(userId);
        }

        assertThatThrownBy(() -> service.checkSearch(userId))
                .isInstanceOf(ApplicationException.class)
                .extracting("status")
                .isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);

        service.checkSearch(UUID.randomUUID());
    }
}
