package com.game_manager.gm.customer;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CustomerActivationGuard {
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private final JdbcTemplate jdbc;
    private final CustomerActivationHash hashes;
    private final Clock clock;

    // The reservation commits even when activation subsequently fails or rolls back.
    // Count all admitted requests, including successes, to bound parallel in-flight guesses.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean reserveAttempt(String ip, String email) {
        lock("global");
        // Match TIMESTAMP(6) precision so a rounded write cannot prolong a lockout.
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        List<Limit> limits = List.of(new Limit("global", 100),
                new Limit("ip:" + hashes.hash("ip", ip == null ? "unknown" : ip), 10),
                new Limit("email:" + hashes.hash("email", email.trim().toLowerCase(Locale.ROOT)), 5));
        for (Limit limit : limits) {
            List<Integer> attempts = jdbc.query("""
                    select attempts from customer_activation_guards
                    where guard_key = ? and window_started_at > ?
                    """, (rs, row) -> rs.getInt(1), limit.key(), Timestamp.from(now.minus(WINDOW)));
            if (!attempts.isEmpty() && attempts.getFirst() >= limit.maximum()) return false;
        }
        for (Limit limit : limits) {
            int changed = jdbc.update("""
                    update customer_activation_guards
                    set attempts = case when window_started_at <= ? then 1 else attempts + 1 end,
                        window_started_at = case when window_started_at <= ? then ? else window_started_at end
                    where guard_key = ?
                    """, Timestamp.from(now.minus(WINDOW)), Timestamp.from(now.minus(WINDOW)),
                    Timestamp.from(now), limit.key());
            if (changed == 0) {
                jdbc.update("insert into customer_activation_guards (guard_key, window_started_at, attempts) "
                        + "values (?, ?, 1)", limit.key(), Timestamp.from(now));
            }
        }
        return true;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockGeneration() {
        lock("generation");
    }

    private void lock(String key) {
        jdbc.queryForObject("select guard_key from customer_activation_guards where guard_key = ? for update",
                String.class, key);
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    @Transactional
    public void removeExpiredBuckets() {
        lock("global");
        jdbc.update("""
                delete from customer_activation_guards where guard_key not in ('global', 'generation')
                and window_started_at <= ? limit 1000
                """, Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS).minus(WINDOW)));
    }

    private record Limit(String key, int maximum) {}
}
