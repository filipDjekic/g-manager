package com.game_manager.gm.jobs;

import com.game_manager.gm.common.config.GManagerProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.MDC;
import tools.jackson.databind.ObjectMapper;

@Service
public class JobService {
    private final JobStore store;
    private final ObjectMapper objectMapper;
    private final GManagerProperties.Jobs properties;
    private final Clock clock;

    public JobService(JobStore store, ObjectMapper objectMapper,
                      GManagerProperties properties, Clock clock) {
        this.store = store;
        this.objectMapper = objectMapper;
        this.properties = properties.jobs();
        this.clock = clock;
    }

    public UUID enqueue(String type, Object payload, String dedupeKey) {
        return enqueue(type, payload, dedupeKey, 0, clock.instant(),
                properties.maxAttempts(), Duration.ofSeconds(properties.timeoutSeconds()));
    }

    public UUID enqueue(String type, Object payload, String dedupeKey, int priority,
                        Instant availableAt, int maxAttempts, Duration timeout) {
        UUID id = UUID.randomUUID();
        try {
            String correlationId = MDC.get("requestId");
            if (correlationId == null || correlationId.isBlank()) {
                correlationId = id.toString();
            }
            store.insert(id, type, objectMapper.writeValueAsString(payload), correlationId,
                    normalize(dedupeKey), priority, maxAttempts, timeout.toSeconds(), availableAt);
            return id;
        } catch (DataIntegrityViolationException exception) {
            if (dedupeKey == null || dedupeKey.isBlank()) {
                throw exception;
            }
            return store.findIdByDedupeKey(dedupeKey.trim()).orElseThrow(() -> exception);
        }
    }

    @Transactional
    public boolean cancel(UUID jobId) {
        return store.requestCancellation(jobId, clock.instant());
    }

    @Transactional
    public boolean retry(UUID jobId) {
        return store.retry(jobId, clock.instant());
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
