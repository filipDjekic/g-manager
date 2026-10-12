package com.game_manager.gm.waitlist;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.waitlist.dto.*;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.sql.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Component;

/** Paginated operational reads and aggregates share the same server-side access predicate. */
@Component @RequiredArgsConstructor
class WaitlistQueries {
    private final NamedParameterJdbcTemplate jdbc;
    private final WaitlistAccessPolicy access;
    private final WorkingHoursService hours;
    private final Clock clock;

    private static final String JOINS = """
        FROM waitlist_entries w
        JOIN users customer ON customer.id=w.customer_id
        JOIN users employee ON employee.id=w.employee_id
        JOIN catalog_items service ON service.id=w.service_id
        LEFT JOIN waitlist_offers offer ON offer.entry_id=w.id
          AND NOT EXISTS(SELECT 1 FROM waitlist_offers newer WHERE newer.entry_id=w.id
            AND (newer.created_at>offer.created_at OR (newer.created_at=offer.created_at AND newer.id>offer.id)))
        LEFT JOIN physical_resources resource ON resource.id=w.resource_id
          OR (w.resource_id IS NULL AND resource.id=offer.resource_id
            AND (offer.status='ACCEPTED' OR (offer.status='OFFERED' AND offer.expires_at>:now)))
        LEFT JOIN areas area ON area.id=COALESCE(resource.area_id,w.area_id)
        LEFT JOIN locations location ON location.id=COALESCE(area.location_id,w.location_id)
        LEFT JOIN physical_resources offered_resource ON offered_resource.id=offer.resource_id
        LEFT JOIN users creator ON creator.id=w.created_by_id
        """;
    private static final String SELECT = """
        SELECT w.*, customer.name customer_name,customer.email customer_email,
          (customer.active AND customer.deleted_at IS NULL) customer_active,
          employee.name employee_name,service.name service_name,service.duration_minutes,
          location.id actual_location_id,location.name location_name,
          area.id actual_area_id,area.name area_name,resource.name resource_name,
          resource.id displayed_resource_id,resource.code resource_code,resource.resource_type,
          offer.id offer_id,offer.status offer_status,offer.created_at offer_created_at,
          offer.expires_at offer_expires_at,offer.resource_id offered_resource_id,
          offered_resource.name offered_resource_name,offer.reservation_id,creator.name creator_name
        """;

    PageResponse<WaitlistOperationalResponse> page(AuthenticatedUser actor, String status, String search, UUID customer,
            LocalDate date, UUID service, UUID location, UUID area, UUID resource, String sort, int page, int size) {
        Instant now=clock.instant();
        var params=access.parameters(actor).addValue("now",Timestamp.from(now));
        StringBuilder where=new StringBuilder(" WHERE "+WaitlistAccessPolicy.SCOPE);
        if(status==null||status.isBlank())where.append(" AND w.status IN ('WAITING','OFFERED')");
        else if(!"ALL".equals(status)) {
            try { WaitlistStatus.valueOf(status); } catch(IllegalArgumentException ex) { throw new ApplicationException(HttpStatus.BAD_REQUEST,"Invalid waitlist status"); }
            where.append(" AND w.status=:status");params.addValue("status",status);
        }
        String value=search==null?"":search.trim();
        if(value.length()>100)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Search is too long");
        if(!value.isEmpty()) {
            where.append(" AND (LOWER(customer.name) LIKE :search OR LOWER(service.name) LIKE :search OR LOWER(resource.name) LIKE :search OR LOWER(resource.code) LIKE :search OR LOWER(location.name) LIKE :search)");
            params.addValue("search","%"+value.toLowerCase(Locale.ROOT)+"%");
        }
        filter(where,params,"w.customer_id","customer",customer);
        filter(where,params,"w.service_id","service",service);
        filter(where,params,"location.id","location",location);
        filter(where,params,"area.id","area",area);
        filter(where,params,"resource.id","resource",resource);
        if(date!=null) {
            where.append(" AND w.desired_start>=:from AND w.desired_start<:to");
            params.addValue("from",Timestamp.from(date.atStartOfDay(hours.getBusinessZone()).toInstant()));
            params.addValue("to",Timestamp.from(date.plusDays(1).atStartOfDay(hours.getBusinessZone()).toInstant()));
        }
        String order=switch(sort==null?"FIFO":sort) {
            case "NEWEST" -> "w.queue_entered_at DESC,w.id DESC";
            case "START_ASC" -> "w.desired_start ASC,w.queue_entered_at ASC,w.id ASC";
            case "START_DESC" -> "w.desired_start DESC,w.queue_entered_at ASC,w.id ASC";
            default -> "w.queue_entered_at ASC,w.id ASC";
        };
        int safeSize=Math.min(100,Math.max(1,size));
        int safePage=Math.max(0,page);
        long total=jdbc.queryForObject("SELECT COUNT(*) "+JOINS+where,params,Long.class);
        params.addValue("limit",safeSize).addValue("offset",(long)safePage*safeSize);
        var content=jdbc.query(SELECT+JOINS+where+" ORDER BY "+order+" LIMIT :limit OFFSET :offset",params,
                (row,index)->map(row,actor,now,false));
        return new PageResponse<>(content,safePage,safeSize,total,(int)((total+safeSize-1)/safeSize));
    }
    WaitlistOperationalResponse detail(AuthenticatedUser actor, UUID id) {
        Instant now=clock.instant();
        return jdbc.query(SELECT+JOINS+" WHERE w.id=:id AND "+WaitlistAccessPolicy.SCOPE,
                access.parameters(actor).addValue("id",id.toString()).addValue("now",Timestamp.from(now)),
                (row,index)->map(row,actor,now,true))
                .stream().findFirst().orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found"));
    }
    WaitlistStatistics statistics(AuthenticatedUser actor) {
        Instant now=clock.instant();
        var today=now.atZone(hours.getBusinessZone()).toLocalDate();
        Instant from=today.withDayOfMonth(1).atStartOfDay(hours.getBusinessZone()).toInstant();
        Instant to=today.withDayOfMonth(1).plusMonths(1).atStartOfDay(hours.getBusinessZone()).toInstant();
        var params=access.parameters(actor).addValue("now",Timestamp.from(now))
                .addValue("from",Timestamp.from(from)).addValue("to",Timestamp.from(to));
        return jdbc.queryForObject("""
            SELECT COALESCE(SUM(w.status IN ('WAITING','OFFERED')),0) active,
              COALESCE(SUM(w.status='WAITING'),0) waiting,
              COALESCE(SUM(w.status='OFFERED' AND offer.status='OFFERED' AND offer.expires_at>:now),0) offered,
              COALESCE(SUM(w.status='ACCEPTED' AND w.status_changed_at>=:from AND w.status_changed_at<:to),0) accepted,
              COALESCE(SUM(w.status='CANCELLED' AND w.status_changed_at>=:from AND w.status_changed_at<:to),0) cancelled,
              COALESCE(SUM(w.status!='CANCELLED' AND (offer.status='EXPIRED' OR (offer.status='OFFERED' AND offer.expires_at<=:now))),0) expired
            """+JOINS+" WHERE "+WaitlistAccessPolicy.SCOPE,params,(row,index)->new WaitlistStatistics(
                row.getLong("active"),row.getLong("waiting"),row.getLong("offered"),row.getLong("accepted"),
                row.getLong("cancelled"),row.getLong("expired"),from,to,now));
    }
    private WaitlistOperationalResponse map(ResultSet row,AuthenticatedUser actor,Instant now,boolean detail) throws SQLException {
        WaitlistStatus status=WaitlistStatus.valueOf(row.getString("status"));
        boolean manage=RolePermissions.has(actor.role(),Permission.WAITLIST_MANAGE);
        Set<String> actions=new LinkedHashSet<>(List.of("DETAILS","CALENDAR"));
        if(RolePermissions.has(actor.role(),Permission.CUSTOMER_READ))actions.add("CUSTOMER");
        if(manage&&status==WaitlistStatus.WAITING)actions.add("EDIT");
        if(manage&&(status==WaitlistStatus.WAITING||status==WaitlistStatus.OFFERED))actions.add("CANCEL");
        String offerStatus=row.getString("offer_status");
        Instant expires=instant(row,"offer_expires_at");
        var state=offerStatus==null?null:WaitlistOfferStatus.valueOf(offerStatus);
        if(state==WaitlistOfferStatus.OFFERED&&expires!=null&&!expires.isAfter(now))state=WaitlistOfferStatus.EXPIRED;
        Instant start=instant(row,"desired_start"),end=instant(row,"desired_end");
        int duration=end==null?row.getInt("duration_minutes"):(int)Duration.between(start,end).toMinutes();
        return new WaitlistOperationalResponse(uuid(row,"id"),uuid(row,"customer_id"),row.getString("customer_name"),
            uuid(row,"employee_id"),row.getString("employee_name"),uuid(row,"service_id"),row.getString("service_name"),
            uuid(row,"actual_location_id"),row.getString("location_name"),uuid(row,"displayed_resource_id"),row.getString("resource_name"),
            instant(row,"created_at"),start,end,status,
            uuid(row,"offer_id"),expires,state,row.getString("resource_code"),row.getLong("version"),now,manage,!manage,
            RolePermissions.has(actor.role(),Permission.CUSTOMER_READ)?row.getString("customer_email"):null,
            row.getBoolean("customer_active"),duration,row.getString("resource_type"),
            uuid(row,"actual_area_id"),row.getString("area_name"),instant(row,"queue_entered_at"),
            detail&&manage?row.getString("internal_note"):null,uuid(row,"created_by_id"),row.getString("creator_name"),
            instant(row,"consent_at"),instant(row,"offer_created_at"),uuid(row,"offered_resource_id"),
            row.getString("offered_resource_name"),uuid(row,"reservation_id"),actions);
    }
    private static void filter(StringBuilder where,MapSqlParameterSource params,String column,String key,UUID value) {
        if(value!=null){where.append(" AND ").append(column).append("=:").append(key);params.addValue(key,value.toString());}
    }
    private static UUID uuid(ResultSet row,String column) throws SQLException {
        String value=row.getString(column);return value==null?null:UUID.fromString(value);
    }
    private static Instant instant(ResultSet row,String column) throws SQLException {
        Timestamp value=row.getTimestamp(column);return value==null?null:value.toInstant();
    }
}
