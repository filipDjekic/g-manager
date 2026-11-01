package com.game_manager.gm.auth;

import com.game_manager.gm.common.error.ApplicationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;

@Service
public class RateLimitService {
    private final ConcurrentHashMap<String, Bucket> attempts = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimitService(Clock clock) {
        this.clock = clock;
    }

    public void checkLogin(String ip, String email) {
        check("login:" + ip + ":" + email.toLowerCase(Locale.ROOT), 5, Duration.ofMinutes(10));
    }

    public void checkOperationalCreate(UUID userId, String endpoint) {
        check("operation:" + userId + ":" + endpoint, 30, Duration.ofMinutes(1));
    }

    public void checkSearch(UUID userId) {
        check("search:" + userId, 60, Duration.ofMinutes(1));
    }

    public void checkMachine(UUID identityId, String operation) {
        check("machine:" + identityId + ":" + operation, 120, Duration.ofMinutes(1));
    }

    public void checkMachineCustomerLogin(UUID identityId) {
        check("machine-customer-login:" + identityId, 5, Duration.ofMinutes(10));
    }

    private void check(String key, int limit, Duration window) {
        attempts.compute(key, (ignored, previous) -> {
            Instant now = clock.instant();
            Bucket bucket = previous == null ? new Bucket(new ArrayDeque<>(), window) : previous;
            Deque<Instant> values = bucket.values();
            while (!values.isEmpty() && values.peekFirst().isBefore(now.minus(window))) {
                values.removeFirst();
            }
            if (values.size() >= limit) {
                throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
            }
            values.addLast(now);
            return bucket;
        });
    }

    @Scheduled(fixedDelay = 60000)
    public void removeExpiredBuckets() {
        Instant now = clock.instant();
        attempts.forEach((key, ignored) -> attempts.computeIfPresent(key, (presentKey, bucket) ->
                bucket.values().stream().allMatch(at -> at.isBefore(now.minus(bucket.window())))
                        ? null : bucket));
    }

    int trackedKeyCount() { return attempts.size(); }

    private record Bucket(Deque<Instant> values, Duration window) {}
}
