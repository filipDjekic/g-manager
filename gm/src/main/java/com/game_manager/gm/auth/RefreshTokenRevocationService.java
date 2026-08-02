package com.game_manager.gm.auth;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class RefreshTokenRevocationService {
    private final RefreshTokenRepository repository;

    public RefreshTokenRevocationService(RefreshTokenRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeAllSessions(UUID userId) {
        repository.revokeAllByUserId(userId);
    }
}
