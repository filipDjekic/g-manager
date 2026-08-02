package com.game_manager.gm.idempotency;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class IdempotencyReservationWriter {
    private final IdempotencyRepository repository;

    @Value("${app.idempotency.ttl-hours:24}")
    private long ttlHours;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insert(String key, String endpoint, String requestHash) {
        Instant now = Instant.now();
        IdempotencyKey entity = new IdempotencyKey();
        entity.setId(UUID.randomUUID());
        entity.setKey(key);
        entity.setEndpoint(endpoint);
        entity.setRequestHash(requestHash);
        entity.setStatus(IdempotencyStatus.IN_PROGRESS);
        entity.setCreatedAt(now);
        entity.setExpiresAt(now.plus(ttlHours, ChronoUnit.HOURS));
        repository.saveAndFlush(entity);
    }
}
