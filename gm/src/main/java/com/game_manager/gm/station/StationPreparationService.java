package com.game_manager.gm.station;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.common.scheduling.ClientStatePort;
import com.game_manager.gm.resource.*;
import jakarta.validation.constraints.*;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class StationPreparationService {
    private final JdbcTemplate jdbc;
    private final CurrentUserProvider current;
    private final ResourceAccessService scope;
    private final PhysicalResourceRepository resources;
    private final GamingStationProfileRepository stations;
    private final ClientStatePort enforcement;
    private final AuditWriter audit;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired private com.game_manager.gm.common.config.DevelopmentStationPolicy development;
    public record Preparation(@NotNull UUID sessionId, @AssertTrue boolean isolatedProfileVerified,
            @NotBlank @Size(max=500) String reason) {}
    public Map<UUID,Boolean> readiness(Collection<UUID> stations) {
        Map<UUID,Boolean> result=new HashMap<>();if(stations.isEmpty()) return result;
        jdbc.query("SELECT station_id,ready FROM station_preparation WHERE station_id IN ("+String.join(",",Collections.nCopies(stations.size(),"?"))+")",
                (org.springframework.jdbc.core.RowCallbackHandler)r->result.put(UUID.fromString(r.getString(1)),r.getBoolean(2)),stations.stream().map(UUID::toString).toArray());stations.stream().filter(development::enabled).forEach(id->result.put(id,true));return result;
    }
    public boolean ready(UUID station) {
        if(development.enabled(station)) return true;
        return jdbc.query("SELECT ready FROM station_preparation WHERE station_id=?",(r,n)->r.getBoolean(1),station.toString()).stream().findFirst().orElse(true);
    }
    @Transactional
    public void occupied(UUID station,UUID session) {
        if(jdbc.update("UPDATE station_preparation SET session_id=?,ready=FALSE,actor_id=NULL,reason=NULL,prepared_at=NULL WHERE station_id=?",session.toString(),station.toString())==0)
            jdbc.update("INSERT INTO station_preparation (station_id,session_id,ready) VALUES (?,?,FALSE)",station.toString(),session.toString());
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public Map<String,Object> state(UUID station) {
        scope.requireManage(current.requireCurrentUser(),station,Permission.GAMING_SESSION_READ);
        var rows=jdbc.queryForList("SELECT * FROM station_preparation WHERE station_id=?",station.toString());
        return rows.isEmpty()?Map.of("ready",true):rows.getFirst();
    }
    @Transactional @PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")
    public void prepare(UUID station,Preparation request) {
        var actor=current.requireCurrentUser();scope.requireManageForUpdate(actor,List.of(station),Permission.GAMING_SESSION_TERMINATE);
        resources.findLocked(station).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Station not found"));
        if(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions WHERE resource_id=? AND status='ACTIVE'",Integer.class,station.toString())!=0)
            throw new ApplicationException(HttpStatus.CONFLICT,"Finish or complete the transfer before preparing this station");
        boolean client=stations.findByResourceId(station).map(GamingStationProfile::isClientEnabled).orElse(false);
        if(client && !enforcement.states(List.of(station)).values().stream().anyMatch(s->"LOCKED".equals(s.status()) && request.sessionId().equals(s.sessionId())))
            throw new ApplicationException(HttpStatus.CONFLICT,"Matching local lock acknowledgement is required before privacy preparation");
        if(!request.isolatedProfileVerified()) throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Verify Windows logoff/profile isolation and external account privacy; locking alone is insufficient");
        if(jdbc.update("UPDATE station_preparation SET ready=TRUE,actor_id=?,reason=?,prepared_at=? WHERE station_id=? AND session_id=? AND ready=FALSE",
                actor.id().toString(),request.reason(),Timestamp.from(clock.instant()),station.toString(),request.sessionId().toString())!=1)
            throw new ApplicationException(HttpStatus.CONFLICT,"Preparation is stale or already confirmed; refresh station state");
        audit.write("STATION_PRIVACY_PREPARED","PHYSICAL_RESOURCE",station,null,
                Map.of("sessionId",request.sessionId(),"profileIsolationVerified",true),request.reason(),AuditVisibility.MANAGEMENT);
    }
}
