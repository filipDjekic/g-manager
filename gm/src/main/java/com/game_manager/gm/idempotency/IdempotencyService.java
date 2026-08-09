package com.game_manager.gm.idempotency;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Instant;
import java.time.Clock;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class IdempotencyService {
    private final IdempotencyRepository repository;
    private final IdempotencyReservationWriter writer;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    public ReservationResult reserve(UUID principalId, String key, String endpoint, String requestHash) {
        ReservationResult result;
        try {
            result = ReservationResult.newKey(writer.insert(principalId, key, endpoint, requestHash));
        } catch (DataIntegrityViolationException exception) {
            Timer.Sample sample = Timer.start(meterRegistry);
            try {
                result = writer.resolveExisting(principalId, key, endpoint, requestHash);
            } finally {
                sample.stop(meterRegistry.timer("idempotency.lock.latency", "operation", endpoint));
            }
        }
        meterRegistry.counter("idempotency.requests", "outcome", result.outcome().name()).increment();
        return result;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void complete(UUID principalId, String key, String endpoint, UUID processingToken,
                         int responseStatus, String responseBody) {
        IdempotencyKey entity = owned(principalId, key, endpoint, processingToken);
        entity.setStatus(IdempotencyStatus.COMPLETED);
        entity.setResponseStatus(responseStatus);
        entity.setResponseBody(responseBody);
        repository.save(entity);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(UUID principalId, String key, String endpoint, UUID processingToken) {
        repository.findScopedForUpdate(principalId, key, endpoint)
                .filter(entity -> entity.getProcessingToken().equals(processingToken))
                .filter(entity -> entity.getStatus() == IdempotencyStatus.IN_PROGRESS)
                .ifPresent(repository::delete);
    }

    @Scheduled(cron = "${app.idempotency.cleanup-cron:0 0 3 * * *}")
    @Transactional
    public void cleanupExpired() {
        repository.deleteCompletedByExpiresAtBefore(clock.instant());
    }

    private IdempotencyKey owned(UUID principalId, String key, String endpoint, UUID processingToken) {
        IdempotencyKey entity = repository.findScopedForUpdate(principalId, key, endpoint).orElseThrow();
        if (!entity.getProcessingToken().equals(processingToken)
                || entity.getStatus() != IdempotencyStatus.IN_PROGRESS) {
            throw new IllegalStateException("Idempotency lease is no longer owned by this request");
        }
        return entity;
    }

    public enum Outcome { NEW, COMPLETED, DIFFERENT_HASH, IN_PROGRESS, EXPIRED_RECOVERED }

    public record ReservationResult(
            Outcome outcome, Integer responseStatus, String responseBody, UUID processingToken) {
        static ReservationResult newKey(UUID token) {
            return new ReservationResult(Outcome.NEW, null, null, token);
        }
        static ReservationResult completed(int status, String body) {
            return new ReservationResult(Outcome.COMPLETED, status, body, null);
        }
        static ReservationResult differentHash() {
            return new ReservationResult(Outcome.DIFFERENT_HASH, null, null, null);
        }
        static ReservationResult inProgress() {
            return new ReservationResult(Outcome.IN_PROGRESS, null, null, null);
        }
        static ReservationResult expired(UUID token) {
            return new ReservationResult(Outcome.EXPIRED_RECOVERED, null, null, token);
        }
    }
}
