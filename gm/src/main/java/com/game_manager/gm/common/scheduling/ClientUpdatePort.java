package com.game_manager.gm.common.scheduling;

import java.time.Instant;
import java.util.UUID;

/** Fixed signed update intent. It never carries an executable, script or caller-supplied URL. */
public interface ClientUpdatePort {
    record Directive(UUID id,String version,Instant notBefore,Instant expiresAt){}
    Directive directive(UUID stationId);
    void observe(UUID stationId,String installedVersion,String status,UUID requestId);
    void claim(UUID stationId,UUID identityId,UUID requestId);
    boolean installing(UUID stationId);
}
