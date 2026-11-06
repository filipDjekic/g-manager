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
    @org.springframework.beans.factory.annotation.Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @org.springframework.beans.factory.annotation.Autowired private java.time.Clock clock;
    private final GamingSessionRepository sessions;

    @Override
    public Set<UUID> activeResources(Collection<UUID> ids) {
        if(ids.isEmpty()) return Set.of();
        Set<UUID> occupied=sessions.findByResourceIdInAndStatus(ids,GamingSessionStatus.ACTIVE).stream().map(GamingSession::getResourceId).collect(Collectors.toSet());
        sessions.findByMoveTargetIdInAndStatus(ids,GamingSessionStatus.ACTIVE).stream().map(GamingSession::getMoveTargetId).forEach(occupied::add);
        jdbc.query("SELECT resource_id FROM gaming_station_assignments WHERE status='WAITING_FOR_LOGIN' AND expires_at>?",(org.springframework.jdbc.core.RowCallbackHandler)r->{UUID id=UUID.fromString(r.getString(1));if(ids.contains(id))occupied.add(id);},java.sql.Timestamp.from(clock.instant()));
        return occupied;
    }

    @Override
    public Map<UUID, Session> latest(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of() : sessions.findLatestCandidates(ids).stream().collect(Collectors.toMap(
                GamingSession::getResourceId, value -> new Session(value.getId(), value.getResourceId(), value.getStatus().name()),
                (first, ignored) -> first));
    }
}
