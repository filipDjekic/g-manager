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
    @org.springframework.beans.factory.annotation.Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @org.springframework.beans.factory.annotation.Autowired private java.time.Clock clock;
    private final GamingSessionRepository sessions;

    @Override @Transactional(readOnly=true)
    public Map<UUID,UUID> waitingAssignmentsByResource() {
        Map<UUID,UUID> result=new HashMap<>();
        jdbc.query("SELECT resource_id,id FROM gaming_station_assignments WHERE status='WAITING_FOR_LOGIN' AND expires_at>?",
            (org.springframework.jdbc.core.RowCallbackHandler)r->result.put(UUID.fromString(r.getString(1)),UUID.fromString(r.getString(2))),java.sql.Timestamp.from(clock.instant()));
        return result;
    }

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
