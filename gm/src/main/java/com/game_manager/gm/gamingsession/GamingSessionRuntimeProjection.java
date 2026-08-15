package com.game_manager.gm.gamingsession;

import com.game_manager.gm.station.StationRuntimeProjectionPort;
import java.util.*;
import java.util.stream.Collectors;
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
        return sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE).stream()
                .collect(Collectors.toMap(GamingSession::getResourceId, GamingSession::getId,
                        (first, ignored) -> first));
    }
}
