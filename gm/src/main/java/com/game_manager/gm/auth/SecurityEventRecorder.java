package com.game_manager.gm.auth;

import com.game_manager.gm.common.security.SecurityEventPort;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class SecurityEventRecorder implements SecurityEventPort {
    private final SecurityEventRepository repository;
    private final MeterRegistry meterRegistry;

    public SecurityEventRecorder(SecurityEventRepository repository, MeterRegistry meterRegistry) {
        this.repository = repository;
        this.meterRegistry = meterRegistry;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordActivationSuccess(UUID userId, String ipHash) {
        repository.save(new SecurityEvent(userId, null,
                SecurityEventType.ACTIVATION_SUCCESS, "Customer activation", ipHash));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID userId, UUID sessionId, SecurityEventType type,
                       SessionRequestMetadata metadata) {
        repository.save(new SecurityEvent(userId, sessionId, type,
                metadata.deviceLabel(), metadata.ipHash()));
        meterRegistry.counter("security.auth.events", "type", type.name()).increment();
    }
}
