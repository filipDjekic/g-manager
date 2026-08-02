package com.game_manager.gm.idempotency;

import java.time.Instant;
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

    public ReservationResult reserve(String key, String endpoint, String requestHash) {
        try {
            writer.insert(key, endpoint, requestHash);
            return ReservationResult.newKey();
        } catch (DataIntegrityViolationException exception) {
            IdempotencyKey existing = repository.findByKeyAndEndpoint(key, endpoint)
                    .orElseThrow(() -> exception);
            if (!existing.getRequestHash().equals(requestHash)) {
                return ReservationResult.differentHash();
            }
            if (existing.getStatus() == IdempotencyStatus.IN_PROGRESS) {
                return ReservationResult.inProgress();
            }
            return ReservationResult.completed(
                    existing.getResponseStatus(), existing.getResponseBody());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(String key, String endpoint, int responseStatus, String responseBody) {
        IdempotencyKey entity = repository.findByKeyAndEndpoint(key, endpoint).orElseThrow();
        entity.setStatus(IdempotencyStatus.COMPLETED);
        entity.setResponseStatus(responseStatus);
        entity.setResponseBody(responseBody);
        repository.save(entity);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(String key, String endpoint) {
        repository.findByKeyAndEndpoint(key, endpoint).ifPresent(repository::delete);
    }

    @Scheduled(cron = "${app.idempotency.cleanup-cron:0 0 3 * * *}")
    @Transactional
    public void cleanupExpired() {
        repository.deleteByExpiresAtBefore(Instant.now());
    }

    public enum Outcome { NEW, COMPLETED, DIFFERENT_HASH, IN_PROGRESS }

    public record ReservationResult(
            Outcome outcome, Integer responseStatus, String responseBody) {
        static ReservationResult newKey() {
            return new ReservationResult(Outcome.NEW, null, null);
        }
        static ReservationResult completed(int status, String body) {
            return new ReservationResult(Outcome.COMPLETED, status, body);
        }
        static ReservationResult differentHash() {
            return new ReservationResult(Outcome.DIFFERENT_HASH, null, null);
        }
        static ReservationResult inProgress() {
            return new ReservationResult(Outcome.IN_PROGRESS, null, null);
        }
    }
}
