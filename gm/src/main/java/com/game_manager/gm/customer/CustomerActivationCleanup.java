package com.game_manager.gm.customer;

import java.time.Clock;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CustomerActivationCleanup {
    private final CustomerActivationTokenRepository tokens;
    private final Clock clock;

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    @Transactional
    public void cleanup() {
        var cutoff = clock.instant().minus(Duration.ofDays(7));
        // Indexed, bounded batches; audit/security events have their own independent retention.
        tokens.deleteConsumedBefore(cutoff);
        tokens.deleteExpiredUnusedBefore(cutoff);
    }
}
