package com.game_manager.gm.auth;

import com.game_manager.gm.common.error.ApplicationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;

@Service
public class RateLimitService {
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimitService(Clock clock) {
        this.clock = clock;
    }

    public void checkLogin(String ip, String email) {
        check("login:" + ip + ":" + email.toLowerCase(), 5, Duration.ofMinutes(10));
    }

    public void checkActivation(String ip) {
        check("activation:" + ip, 10, Duration.ofHours(1));
    }

    public void checkOperationalCreate(UUID userId, String endpoint) {
        check("operation:" + userId + ":" + endpoint, 30, Duration.ofMinutes(1));
    }

    public void checkSearch(UUID userId) {
        check("search:" + userId, 60, Duration.ofMinutes(1));
    }

    private void check(String key, int limit, Duration window) {
        Instant now = clock.instant();
        Deque<Instant> values = attempts.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (values) {
            while (!values.isEmpty() && values.peekFirst().isBefore(now.minus(window))) {
                values.removeFirst();
            }
            if (values.size() >= limit) {
                throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
            }
            values.addLast(now);
        }
    }
}
