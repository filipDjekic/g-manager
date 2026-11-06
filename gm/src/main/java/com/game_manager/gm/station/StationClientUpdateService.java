package com.game_manager.gm.station;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.scheduling.ClientUpdatePort;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.resource.ResourceAccessService;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StationClientUpdateService implements ClientUpdatePort {
    private final JdbcTemplate jdbc;private final Clock clock;private final CurrentUserProvider users;
    private final ResourceAccessService access;private final GamingStationProfileRepository stations;
    private final AuditWriter audit;private final String version,status;
    public StationClientUpdateService(JdbcTemplate jdbc,Clock clock,CurrentUserProvider users,ResourceAccessService access,
            GamingStationProfileRepository stations,AuditWriter audit,@Value("${app.gaming-client.version}")String version,
            @Value("${app.gaming-client.status}")String status){
        this.jdbc=jdbc;this.clock=clock;this.users=users;this.access=access;this.stations=stations;this.audit=audit;this.version=version;this.status=status;
    }
    public record Update(UUID id,String targetVersion,String status,Instant requestedAt,Instant notBefore,Instant expiresAt,Instant updatedAt,String reason){}
    private List<Update> rows(UUID stationId,int limit){return rows(stationId,limit,0);}
    private List<Update> rows(UUID stationId,int limit,long offset){return jdbc.query("SELECT * FROM station_client_updates WHERE station_id=? ORDER BY requested_at DESC,id DESC LIMIT ? OFFSET ?",
        (r,n)->new Update(UUID.fromString(r.getString("id")),r.getString("target_version"),effectiveStatus(r.getString("status"),r.getTimestamp("expires_at").toInstant(),r.getTimestamp("claim_until")==null?null:r.getTimestamp("claim_until").toInstant()),
            r.getTimestamp("requested_at").toInstant(),r.getTimestamp("not_before").toInstant(),r.getTimestamp("expires_at").toInstant(),r.getTimestamp("updated_at").toInstant(),r.getString("reason")),stationId.toString(),limit,offset);}
    private boolean pending(String value){return Set.of("REQUESTED","DEFERRED","DOWNLOADING","INSTALLING").contains(value);}
    private String effectiveStatus(String value,Instant expiry,Instant claimUntil){return pending(value)&&(!expiry.isAfter(clock.instant())||"INSTALLING".equals(value)&&(claimUntil==null||!claimUntil.isAfter(clock.instant())))?"EXPIRED":value;}
    private void authorize(UUID stationId,Permission permission){access.requireManage(users.requireCurrentUser(),stationId,permission);if(!stations.findByResourceId(stationId).map(GamingStationProfile::isClientEnabled).orElse(false))throw new ApplicationException(HttpStatus.CONFLICT,"Enabled Client station required");}
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('STATION_MAINTENANCE')")
    public List<Update> history(UUID stationId){authorize(stationId,Permission.STATION_MAINTENANCE);return rows(stationId,20);}
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('STATION_MAINTENANCE')")
    public com.game_manager.gm.common.dto.PageResponse<Update> history(UUID stationId,int page,int size){
        authorize(stationId,Permission.STATION_MAINTENANCE);
        var request=com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted());
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM station_client_updates WHERE station_id=?",Long.class,stationId.toString());
        return new com.game_manager.gm.common.dto.PageResponse<>(rows(stationId,request.getPageSize(),request.getOffset()),request.getPageNumber(),request.getPageSize(),total,(int)Math.ceil((double)total/request.getPageSize()));
    }
    @Transactional @PreAuthorize("hasAuthority('STATION_MAINTENANCE')")
    public Update request(UUID stationId,Instant requestedTime,String reason){
        authorize(stationId,Permission.STATION_MAINTENANCE);
        if(!"RELEASED".equals(status)||!version.matches("\\d+\\.\\d+\\.\\d+(\\.\\d+)?"))throw new ApplicationException(HttpStatus.CONFLICT,"No approved Client release available");
        Instant now=clock.instant(),notBefore=requestedTime==null?now:requestedTime;
        if(notBefore.isBefore(now.minusSeconds(60))||notBefore.isAfter(now.plus(Duration.ofDays(3))))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Update time must be within the next three days");
        if(reason==null||reason.isBlank()||reason.length()>500)throw new ApplicationException(HttpStatus.BAD_REQUEST,"A reason up to 500 characters is required");
        jdbc.queryForObject("SELECT id FROM physical_resources WHERE id=? FOR UPDATE",String.class,stationId.toString());
        var latest=rows(stationId,1);
        if(!latest.isEmpty()&&pending(latest.getFirst().status())&&latest.getFirst().targetVersion().equals(version))return latest.getFirst();
        if(installing(stationId))throw new ApplicationException(HttpStatus.CONFLICT,"Client installation is already in progress");
        jdbc.update("UPDATE station_client_updates SET status='SUPERSEDED',updated_at=? WHERE station_id=? AND status IN ('REQUESTED','DEFERRED','DOWNLOADING','INSTALLING')",Timestamp.from(now),stationId.toString());
        UUID id=UUID.randomUUID();Instant expires=notBefore.plus(Duration.ofDays(7));
        jdbc.update("INSERT INTO station_client_updates (id,station_id,target_version,status,requested_by,requested_at,not_before,expires_at,updated_at,reason) VALUES (?,?,?,'REQUESTED',?,?,?,?,?,?)",
            id.toString(),stationId.toString(),version,users.requireCurrentUser().id().toString(),Timestamp.from(now),Timestamp.from(notBefore),Timestamp.from(expires),Timestamp.from(now),reason.trim());
        audit.write("CLIENT_UPDATE_REQUESTED","PHYSICAL_RESOURCE",stationId,null,Map.of("requestId",id,"targetVersion",version,"notBefore",notBefore),reason,AuditVisibility.MANAGEMENT);
        return rows(stationId,1).getFirst();
    }
    @Override public Directive directive(UUID stationId){
        var values=rows(stationId,1);if(values.isEmpty())return null;var value=values.getFirst();
        return pending(value.status())&&"RELEASED".equals(status)&&value.targetVersion().equals(version)?new Directive(value.id(),version,value.notBefore(),value.expiresAt()):null;
    }
    @Override public void observe(UUID stationId,String installedVersion,String updateStatus,UUID requestId){
        var values=rows(stationId,1);if(values.isEmpty())return;var value=values.getFirst();
        if(value.targetVersion().equals(installedVersion)&&!Set.of("SUPERSEDED","APPLIED").contains(value.status())){jdbc.update("UPDATE station_client_updates SET status='APPLIED',updated_at=? WHERE id=?",Timestamp.from(clock.instant()),value.id().toString());return;}
        if(!pending(value.status()))return;
        String next=value.targetVersion().equals(installedVersion)?"APPLIED":value.id().equals(requestId)&&Set.of("DEFERRED","DOWNLOADING","FAILED","ROLLED_BACK").contains(updateStatus==null?"":updateStatus)?"ROLLED_BACK".equals(updateStatus)?"FAILED":updateStatus:null;
        if("INSTALLING".equals(value.status())&&Set.of("DEFERRED","DOWNLOADING").contains(next==null?"":next))return;
        if(next!=null&&!next.equals(value.status()))jdbc.update("UPDATE station_client_updates SET status=?,updated_at=? WHERE id=? AND status IN ('REQUESTED','DEFERRED','DOWNLOADING','INSTALLING')",next,Timestamp.from(clock.instant()),value.id().toString());
    }
    @Override public boolean installing(UUID stationId){
        return !jdbc.queryForList("SELECT id FROM station_client_updates WHERE station_id=? AND status='INSTALLING' AND claim_until>? AND expires_at>? FOR UPDATE",String.class,stationId.toString(),Timestamp.from(clock.instant()),Timestamp.from(clock.instant())).isEmpty();
    }
    @Override @Transactional public void claim(UUID stationId,UUID identityId,UUID requestId){
        if(!"RELEASED".equals(status))throw new ApplicationException(HttpStatus.CONFLICT,"No approved release available");
        jdbc.queryForObject("SELECT id FROM physical_resources WHERE id=? FOR UPDATE",String.class,stationId.toString());
        if(!jdbc.queryForList("SELECT id FROM gaming_station_assignments WHERE resource_id=? AND status='WAITING_FOR_LOGIN' AND expires_at>? FOR UPDATE",String.class,stationId.toString(),Timestamp.from(clock.instant())).isEmpty())throw new ApplicationException(HttpStatus.CONFLICT,"Cancel the waiting gaming assignment before installation");
        if(!jdbc.queryForList("SELECT id FROM gaming_sessions WHERE (resource_id=? OR move_target_id=?) AND status='ACTIVE' FOR UPDATE",String.class,stationId.toString(),stationId.toString()).isEmpty())throw new ApplicationException(HttpStatus.CONFLICT,"A paid session must finish before installation");
        if(installing(stationId))throw new ApplicationException(HttpStatus.CONFLICT,"An installation is already in progress");
        var latest=rows(stationId,1);Update intent=latest.isEmpty()?null:latest.getFirst();Instant now=clock.instant();
        if(requestId!=null&&(intent==null||!requestId.equals(intent.id())||!pending(intent.status())||!intent.targetVersion().equals(version)||intent.notBefore().isAfter(now)))throw new ApplicationException(HttpStatus.CONFLICT,"The signed update request is not eligible");
        UUID id=requestId;
        if(id==null){
            jdbc.update("UPDATE station_client_updates SET status='SUPERSEDED',updated_at=? WHERE station_id=? AND status IN ('REQUESTED','DEFERRED','DOWNLOADING','INSTALLING')",Timestamp.from(now),stationId.toString());
            id=UUID.randomUUID();
            jdbc.update("INSERT INTO station_client_updates (id,station_id,target_version,status,requested_at,not_before,expires_at,updated_at,reason) VALUES (?,?,?,'REQUESTED',?,?,?,?,?)",id.toString(),stationId.toString(),version,Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(600)),Timestamp.from(now),"Update authorized by a local Windows administrator");
        }
        jdbc.update("UPDATE station_client_updates SET status='INSTALLING',claimed_by=?,claim_until=?,updated_at=? WHERE id=?",identityId.toString(),Timestamp.from(now.plusSeconds(600)),Timestamp.from(now),id.toString());
    }
}
