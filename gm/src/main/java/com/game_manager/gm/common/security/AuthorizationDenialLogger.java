package com.game_manager.gm.common.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AuthorizationDenialLogger {
    private static final Logger log = LoggerFactory.getLogger(AuthorizationDenialLogger.class);

    public void denied(
            Permission permission, AuthenticatedUser actor, String resourceType, String relation) {
        log.warn("Authorization denied [permission={}, actorRole={}, resourceType={}, relation={}]",
                permission, actor.role(), resourceType, relation);
    }
}
