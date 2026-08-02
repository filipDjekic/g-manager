package com.game_manager.gm.auth;

import com.game_manager.gm.common.security.SessionRevocationPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class RefreshTokenRevocationService implements SessionRevocationPort {
    private final RefreshTokenRepository repository;

    public RefreshTokenRevocationService(RefreshTokenRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeAllSessions(UUID userId) {
        repository.revokeAllByUserId(userId);
    }
}
