package com.game_manager.gm.auth;

import com.game_manager.gm.common.error.ApplicationException;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimitServiceTest {
    @Test
    void clockAdjustmentCannotEvictABucketWithAnUnexpiredAttempt() {
        Clock clock = org.mockito.Mockito.mock(Clock.class);
        java.time.Instant start = java.time.Instant.parse("2026-01-01T00:00:00Z");
        org.mockito.Mockito.when(clock.instant()).thenReturn(start.plusSeconds(60), start, start.plusSeconds(630));
        RateLimitService service = new RateLimitService(clock);
        service.checkLogin("test", "test@example.test");
        service.checkLogin("test", "test@example.test");
        service.removeExpiredBuckets();
        org.assertj.core.api.Assertions.assertThat(service.trackedKeyCount()).isOne();
    }

    @Test
    void expiresIdleKeysWithoutResettingLongerWindowsOrBoundaryAttempts() {
        java.util.concurrent.atomic.AtomicReference<java.time.Instant> now =
                new java.util.concurrent.atomic.AtomicReference<>(java.time.Instant.parse("2026-01-01T00:00:00Z"));
        Clock clock = org.mockito.Mockito.mock(Clock.class);
        org.mockito.Mockito.when(clock.instant()).thenAnswer(invocation -> now.get());
        RateLimitService service = new RateLimitService(clock);
        service.checkLogin("test", "test@example.test");
        service.checkActivation("test");
        now.set(now.get().plusSeconds(600));
        service.removeExpiredBuckets();
        org.assertj.core.api.Assertions.assertThat(service.trackedKeyCount()).isEqualTo(2);
        now.set(now.get().plusNanos(1));
        service.removeExpiredBuckets();
        org.assertj.core.api.Assertions.assertThat(service.trackedKeyCount()).isOne();
        now.set(now.get().plusSeconds(3600));
        service.removeExpiredBuckets();
        org.assertj.core.api.Assertions.assertThat(service.trackedKeyCount()).isZero();
    }

    @Test
    void concurrentCleanupCannotResetAnActiveQuota() throws Exception {
        RateLimitService service = new RateLimitService(Clock.fixed(java.time.Instant.now(), java.time.ZoneOffset.UTC));
        UUID identity = UUID.randomUUID();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(8)) {
            var tasks = java.util.stream.IntStream.range(0, 240).mapToObj(i -> (java.util.concurrent.Callable<Boolean>) () -> {
                service.removeExpiredBuckets();
                try { service.checkMachine(identity, "poll"); return true; }
                catch (ApplicationException limited) { return false; }
            }).toList();
            int accepted = 0;
            for (var future : executor.invokeAll(tasks)) if (future.get()) accepted++;
            org.assertj.core.api.Assertions.assertThat(accepted).isEqualTo(120);
        }
    }

    @Test
    void machineLimitIsPartitionedByIdentityRatherThanIp() {
        RateLimitService service = new RateLimitService(Clock.systemUTC());
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        for (int index = 0; index < 120; index++) service.checkMachine(first, "poll");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.checkMachine(first, "poll"))
                .isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
        service.checkMachine(second, "poll");
    }

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
            service.checkActivation("192.0.2.1");
        }

        assertThatThrownBy(() -> service.checkActivation("192.0.2.1"))
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
