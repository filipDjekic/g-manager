package com.game_manager.gm.gamingsession;

import com.game_manager.gm.station.StationRuntimeProjectionPort;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Primary
@RequiredArgsConstructor
public class GamingSessionRuntimeProjection implements StationRuntimeProjectionPort {
    private final GamingSessionRepository sessions;

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, UUID> activeSessionIdsByResource() {
        Map<UUID,UUID> result=new HashMap<>();
        for(var session:sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE)) {
            result.putIfAbsent(session.getResourceId(),session.getId());
            if(session.getMoveTargetId()!=null) result.putIfAbsent(session.getMoveTargetId(),session.getId());
        }
        return result;
    }
}
