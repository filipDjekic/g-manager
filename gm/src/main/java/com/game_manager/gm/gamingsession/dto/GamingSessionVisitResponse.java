package com.game_manager.gm.gamingsession.dto;

import com.game_manager.gm.gamingsession.GamingSessionStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

public record GamingSessionVisitResponse(UUID id, UUID resourceId, String resourceName, UUID locationId,
        Instant startedAt, Instant endsAt, Instant endedAt, GamingSessionStatus status,
        Instant serverTime, long remainingSeconds, com.game_manager.gm.gamingsession.GamingBillingMode billingMode, long billedSeconds, java.math.BigDecimal chargedAmount) {
    public GamingSessionVisitResponse(UUID id, UUID resourceId, String resourceName, UUID locationId,
            Instant startedAt, Instant endsAt, Instant endedAt, GamingSessionStatus status, Instant serverTime) {
        this(id,resourceId,resourceName,locationId,startedAt,endsAt,endedAt,status,serverTime,com.game_manager.gm.gamingsession.GamingBillingMode.FIXED_DURATION,0,null);
    }
    public GamingSessionVisitResponse(UUID id,UUID resourceId,String resourceName,UUID locationId,Instant startedAt,Instant endsAt,Instant endedAt,GamingSessionStatus status,Instant serverTime,com.game_manager.gm.gamingsession.GamingBillingMode mode,long seconds,java.math.BigDecimal amount) {
        this(id, resourceId, resourceName, locationId, startedAt, endsAt, endedAt, status, serverTime,
                status == GamingSessionStatus.ACTIVE
                        ? Math.max(0, Duration.between(serverTime, endsAt).toSeconds()) : 0,mode,seconds,amount);
    }
}
