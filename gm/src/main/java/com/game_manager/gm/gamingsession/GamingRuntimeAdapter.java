package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.scheduling.GamingRuntimePort;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GamingRuntimeAdapter implements GamingRuntimePort {
    private final GamingSessionRepository sessions;

    @Override
    public Set<UUID> activeResources(Collection<UUID> ids) {
        return ids.isEmpty() ? Set.of() : sessions.findByResourceIdInAndStatus(ids, GamingSessionStatus.ACTIVE).stream()
                .map(GamingSession::getResourceId).collect(Collectors.toSet());
    }

    @Override
    public Map<UUID, Session> latest(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of() : sessions.findLatestCandidates(ids).stream().collect(Collectors.toMap(
                GamingSession::getResourceId, value -> new Session(value.getId(), value.getResourceId(), value.getStatus().name()),
                (first, ignored) -> first));
    }
}
