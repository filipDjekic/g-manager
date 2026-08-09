package com.game_manager.gm.idempotency;

import com.game_manager.gm.common.config.GManagerProperties;
import java.time.Instant;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class IdempotencyReservationWriter {
    private final IdempotencyRepository repository;
    private final GManagerProperties properties;
    private final Clock clock;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UUID insert(UUID principalId, String key, String endpoint, String requestHash) {
        Instant now = clock.instant();
        UUID processingToken = UUID.randomUUID();
        IdempotencyKey entity = new IdempotencyKey();
        entity.setId(UUID.randomUUID());
        entity.setKey(key);
        entity.setPrincipalId(principalId);
        entity.setEndpoint(endpoint);
        entity.setRequestHash(requestHash);
        entity.setStatus(IdempotencyStatus.IN_PROGRESS);
        entity.setCreatedAt(now);
        entity.setProcessingToken(processingToken);
        entity.setLeaseExpiresAt(now.plusSeconds(properties.idempotency().inProgressTimeoutSeconds()));
        entity.setExpiresAt(now.plus(
                properties.idempotency().ttlHours(), ChronoUnit.HOURS));
        repository.saveAndFlush(entity);
        return processingToken;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public IdempotencyService.ReservationResult resolveExisting(
            UUID principalId, String key, String endpoint, String requestHash) {
        IdempotencyKey existing = repository.findScopedForUpdate(principalId, key, endpoint).orElseThrow();
        Instant now = clock.instant();
        if (existing.getStatus() == IdempotencyStatus.COMPLETED && existing.getExpiresAt().isAfter(now)) {
            if (!existing.getRequestHash().equals(requestHash)) {
                return IdempotencyService.ReservationResult.differentHash();
            }
            return IdempotencyService.ReservationResult.completed(
                    existing.getResponseStatus(), existing.getResponseBody());
        }
        if (existing.getStatus() == IdempotencyStatus.IN_PROGRESS
                && existing.getLeaseExpiresAt().isAfter(now)) {
            if (!existing.getRequestHash().equals(requestHash)) {
                return IdempotencyService.ReservationResult.differentHash();
            }
            return IdempotencyService.ReservationResult.inProgress();
        }
        UUID processingToken = UUID.randomUUID();
        existing.setRequestHash(requestHash);
        existing.setStatus(IdempotencyStatus.IN_PROGRESS);
        existing.setResponseStatus(null);
        existing.setResponseBody(null);
        existing.setProcessingToken(processingToken);
        existing.setLeaseExpiresAt(now.plusSeconds(properties.idempotency().inProgressTimeoutSeconds()));
        existing.setCreatedAt(now);
        existing.setExpiresAt(now.plus(properties.idempotency().ttlHours(), ChronoUnit.HOURS));
        repository.saveAndFlush(existing);
        return IdempotencyService.ReservationResult.expired(processingToken);
    }
}
