package com.game_manager.gm.auth;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class SecurityEventRecorder {
    private final SecurityEventRepository repository;
    private final MeterRegistry meterRegistry;

    public SecurityEventRecorder(SecurityEventRepository repository, MeterRegistry meterRegistry) {
        this.repository = repository;
        this.meterRegistry = meterRegistry;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID userId, UUID sessionId, SecurityEventType type,
                       SessionRequestMetadata metadata) {
        repository.save(new SecurityEvent(userId, sessionId, type,
                metadata.deviceLabel(), metadata.ipHash()));
        meterRegistry.counter("security.auth.events", "type", type.name()).increment();
    }
}
