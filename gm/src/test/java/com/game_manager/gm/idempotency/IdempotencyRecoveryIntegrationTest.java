package com.game_manager.gm.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class IdempotencyRecoveryIntegrationTest {
    @Autowired IdempotencyRepository repository;
    @Autowired IdempotencyService service;

    @Test
    void expiredInProgressLeaseIsDeterministicallyTakenOver() {
        UUID principal = UUID.randomUUID();
        IdempotencyKey stale = new IdempotencyKey();
        stale.setId(UUID.randomUUID()); stale.setPrincipalId(principal); stale.setKey(UUID.randomUUID().toString());
        stale.setEndpoint("POST /api/v1/orders"); stale.setRequestHash("a".repeat(64));
        stale.setStatus(IdempotencyStatus.IN_PROGRESS); stale.setProcessingToken(UUID.randomUUID());
        stale.setCreatedAt(Instant.now().minusSeconds(300));
        stale.setLeaseExpiresAt(Instant.now().minusSeconds(180));
        stale.setExpiresAt(Instant.now().plusSeconds(3600));
        repository.saveAndFlush(stale);

        IdempotencyService.ReservationResult result = service.reserve(
                principal, stale.getKey(), stale.getEndpoint(), "b".repeat(64));

        assertThat(result.outcome()).isEqualTo(IdempotencyService.Outcome.EXPIRED_RECOVERED);
        assertThat(result.processingToken()).isNotNull().isNotEqualTo(stale.getProcessingToken());
        IdempotencyKey recovered = repository.findById(stale.getId()).orElseThrow();
        assertThat(recovered.getRequestHash()).isEqualTo("b".repeat(64));
        assertThat(recovered.getLeaseExpiresAt()).isAfter(Instant.now());
    }
}
