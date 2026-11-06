package com.game_manager.gm.gamingsession.billing;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.events.*;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.gamingsession.dto.GamingSessionResponse;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.reservation.*;
import com.game_manager.gm.station.*;
import com.game_manager.gm.user.*;
import com.game_manager.gm.workinghours.WorkingHoursService;
import jakarta.validation.constraints.*;
import java.math.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Lock order: customer, station, session, account. The ledger and balance commit together. */
@Service @RequiredArgsConstructor
public class GamingTimeService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final MachineStationIdentity machinePrincipal;
    private final GamingSessionRepository sessions;
    private final ResourceManagementService resources;
    private final PhysicalResourceRepository physicalResources;
    private final GamingSessionLocationPolicy scope;
    private final StationReadinessService readiness;
    private final StationPreparationService preparation;
    private final ReservationRepository reservations;
    private final ReservationAvailabilityPolicy availability;
    private final WorkingHoursService hours;
    private final StationCommandWriter commands;
    private final CurrentUserProvider current;
    private final AuditWriter audit;
    private final OutboxWriter outbox;
    private final jakarta.persistence.EntityManager em;
    private final Clock clock;
    @Value("${app.gaming-client.lease-duration-seconds:30}") private long leaseSeconds=30;
    @Value("${app.gaming-session.login-timeout-seconds:300}") private long loginSeconds=300;

    public record Grant(@NotNull @DecimalMin("30") @DecimalMax("5256000") @Digits(integer=7,fraction=0) BigDecimal minutes, @NotNull @PositiveOrZero Long priceVersion) {}
    public record TimePrice(@DecimalMin("0.01") @Digits(integer=10,fraction=2) BigDecimal pricePerMinute,
                            @NotNull @PositiveOrZero Long version) {}
    public record Assignment(@NotNull UUID customerId,@NotNull UUID resourceId,UUID reservationId) {}

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_PAYMENT_RECORD')")
    public TimePrice price() { return readPrice(false); }

    @Transactional @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public TimePrice savePrice(TimePrice request) {
        var actor=current.requireCurrentUser();requireStaff(actor,Permission.GAMING_FINANCE_MANAGE);
        if(request.pricePerMinute()==null || request.pricePerMinute().signum()<=0 || request.version()==null)
            throw fail(HttpStatus.BAD_REQUEST,"Enter a positive gaming minute price");
        BigDecimal amount;
        try { amount=request.pricePerMinute().setScale(2,RoundingMode.UNNECESSARY); }
        catch(ArithmeticException e){throw fail(HttpStatus.BAD_REQUEST,"RSD must have at most two decimal places");}
        if(amount.precision()>12)throw fail(HttpStatus.BAD_REQUEST,"Gaming minute price is too large");
        var before=readPrice(true);
        if(!before.version().equals(request.version()))throw fail(HttpStatus.CONFLICT,"Gaming price changed; refresh settings");
        jdbc.update("UPDATE gaming_business_policy SET minute_price=?,time_price_version=time_price_version+1 WHERE id=1",amount);
        audit.write("GAMING_MINUTE_PRICE_CHANGED","GAMING_POLICY",UUID.nameUUIDFromBytes("gaming-business-policy:1".getBytes(java.nio.charset.StandardCharsets.UTF_8)),null,Map.of("pricePerMinute",amount,"version",before.version()+1),null,AuditVisibility.MANAGEMENT);
        return readPrice(false);
    }

    private TimePrice readPrice(boolean lock) {
        return jdbc.queryForObject("SELECT minute_price,time_price_version FROM gaming_business_policy WHERE id=1"+(lock?" FOR UPDATE":""),
                (r,n)->new TimePrice(r.getBigDecimal(1),r.getLong(2)));
    }

    @Transactional(readOnly=true) @PreAuthorize("isAuthenticated()")
    public Map<String,Object> account(UUID customerId) {
        requireAccess(customerId);
        var result=new LinkedHashMap<String,Object>();
        long balance=balance(customerId);
        var active=sessions.findByCustomerIdAndStatus(customerId,GamingSessionStatus.ACTIVE).orElse(null);
        // Display only: outstanding seconds are committed by the runtime under the customer lock.
        if(active!=null && active.getBillingMode()==GamingBillingMode.TIME_BALANCE)
            balance=Math.max(0,balance-unsettled(active,clock.instant(),balance));
        result.put("customerId",customerId);result.put("serverTime",clock.instant());result.put("balanceSeconds",balance);
        result.put("activeSession",active==null?null:GamingSessionResponse.from(active,clock.instant()));
        result.put("consumedSeconds",active==null?0:active.getBilledSeconds()+(active.getBillingMode()==GamingBillingMode.TIME_BALANCE?unsettled(active,clock.instant(),balance(active.getCustomerId())):0));
        result.put("resourceName",active==null?null:physicalResources.findById(active.getResourceId()).map(PhysicalResource::getName).orElse(null));
        result.put("assignments",jdbc.queryForList("SELECT * FROM gaming_station_assignments WHERE customer_id=? AND status='WAITING_FOR_LOGIN' AND expires_at>?",str(customerId),ts(clock.instant())));
        return result;
    }

    @Transactional(readOnly=true) @PreAuthorize("isAuthenticated()")
    public com.game_manager.gm.common.dto.PageResponse<Map<String,Object>> history(UUID id,String kind,int page,int size) {
        requireAccess(id);
        if("transactions".equals(kind))requireStaff(current.requireCurrentUser(),Permission.GAMING_PAYMENT_RECORD);
        String sql=switch(kind) {
            case "ledger" -> "SELECT * FROM gaming_time_ledger WHERE customer_id=?";
            case "transactions" -> "SELECT * FROM gaming_financial_operations WHERE customer_id=?";
            default -> throw fail(HttpStatus.BAD_REQUEST,"Unknown time history");
        };
        List<Object> args=new ArrayList<>();args.add(str(id));
        var actor=current.requireCurrentUser();
        if("transactions".equals(kind) && actor.role()==Role.EMPLOYEE) {
            var assigned=scope.assignedResources(actor);
            sql+=" AND resource_id IN ("+String.join(",",Collections.nCopies(assigned.size(),"?"))+")";
            assigned.forEach(resource->args.add(str(resource)));
        }
        return com.game_manager.gm.common.dto.SqlPages.maps(jdbc,sql,"created_at DESC,id DESC",page,size,args.toArray());
    }

    @Transactional(isolation=Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_PAYMENT_RECORD')")
    public Map<String,Object> grant(UUID customerId,Grant request,String key) {
        var actor=current.requireCurrentUser();requireStaff(actor,Permission.GAMING_PAYMENT_RECORD);
        lockCustomer(customerId,true);
        UUID context=financialContext(actor);
        if(context!=null)scope.requireResourceManagement(actor,context,Permission.GAMING_PAYMENT_RECORD);
        var resource=context==null?null:physicalResources.findById(context).orElseThrow(()->fail(HttpStatus.NOT_FOUND,"Payment location not found"));
        String source="grant:"+actor.id()+":"+customerId+":"+key;
        if(blank(key) || key.length()>255)throw fail(HttpStatus.BAD_REQUEST,"A bounded idempotency key is required");
        if(request.minutes()==null || request.minutes().scale()>0 || request.minutes().compareTo(BigDecimal.valueOf(30))<0 || request.minutes().compareTo(BigDecimal.valueOf(5256000))>0 || request.priceVersion()==null)
            throw fail(HttpStatus.BAD_REQUEST,"Add at least 30 whole minutes and confirm the current price");
        long seconds=Math.multiplyExact(request.minutes().longValueExact(),60);
        if(hasEntry(source)) {
            var original=jdbc.queryForMap("SELECT f.granted_seconds,f.price_version FROM gaming_financial_operations f JOIN gaming_time_ledger l ON l.operation_id=f.id WHERE l.source_key=?",source);
            if(((Number)original.get("granted_seconds")).longValue()!=seconds || original.get("price_version")==null || ((Number)original.get("price_version")).longValue()!=request.priceVersion())
                throw fail(HttpStatus.CONFLICT,"Idempotency-Key was already used with a different purchase");
            return account(customerId);
        }
        var price=readPrice(true);
        if(price.pricePerMinute()==null)throw fail(HttpStatus.CONFLICT,"OWNER/ADMIN must configure the gaming minute price first");
        if(!price.version().equals(request.priceVersion()))throw fail(HttpStatus.CONFLICT,"Gaming price changed; review the new total before confirming payment");
        BigDecimal amount=price.pricePerMinute().multiply(request.minutes()).setScale(2);
        if(amount.precision()>14)throw fail(HttpStatus.BAD_REQUEST,"Payment amount is too large");
        GamingSession active=lockActive(customerId);
        if(active!=null) settle(active,clock.instant());
        UUID operation=UUID.randomUUID();
        jdbc.update("INSERT INTO gaming_financial_operations(id,customer_id,resource_id,location_id,actor_id,kind,method,amount,currency,status,granted_seconds,minute_price,price_version,created_at) VALUES(?,?,?,?,?,'TIME_GRANT','CASH',?,'RSD','RECORDED',?,?,?,?)",
                str(operation),str(customerId),str(context),resource==null?null:str(resources.locationId(resource)),str(actor.id()),amount,seconds,price.pricePerMinute(),price.version(),ts(clock.instant()));
        append(customerId,null,operation,actor.id(),seconds,"GRANT",null,source);
        audit.write("GAMING_TIME_GRANTED","GAMING_FINANCE",operation,null,Map.of("customerId",customerId,"amount",amount,"seconds",seconds,"pricePerMinute",price.pricePerMinute()),null,AuditVisibility.MANAGEMENT);
        if(active!=null && active.getStatus()==GamingSessionStatus.ACTIVE) refreshEnd(active);
        return account(customerId);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_SESSION_START')")
    public Map<String,Object> assign(Assignment request) {
        var actor=current.requireCurrentUser();requireStaff(actor,Permission.GAMING_SESSION_START);
        lockCustomer(request.customerId(),true);scope.requireResourceManagement(actor,request.resourceId(),Permission.GAMING_SESSION_START);
        var resource=resources.lockGamingStation(request.resourceId());Instant now=clock.instant();expireWaiting(now);
        if(balance(request.customerId())<=0)throw fail(HttpStatus.CONFLICT,"Customer has no gaming time");
        if(sessions.existsByCustomerIdAndStatus(request.customerId(),GamingSessionStatus.ACTIVE) || sessions.existsByResourceIdAndStatus(request.resourceId(),GamingSessionStatus.ACTIVE) || sessions.existsByMoveTargetIdAndStatus(request.resourceId(),GamingSessionStatus.ACTIVE))throw fail(HttpStatus.CONFLICT,"Customer or station already has an active session");
        if(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_station_assignments WHERE status='WAITING_FOR_LOGIN' AND (customer_id=? OR resource_id=?)",Integer.class,str(request.customerId()),str(request.resourceId()))>0)throw fail(HttpStatus.CONFLICT,"Customer or station already has an assignment");
        readiness.requireManagedClient(request.resourceId());readiness.requireReadyForSession(request.resourceId());
        Instant boundary=boundary(request.resourceId(),resources.locationId(resource),request.customerId(),request.reservationId(),now);
        Instant expiry=min(now.plusSeconds(Math.max(1,loginSeconds)),boundary);
        availability.requireResourceReservationAvailableForUpdate(request.resourceId(),now,expiry,request.reservationId());
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO gaming_station_assignments(id,customer_id,resource_id,reservation_id,assigned_by,status,created_at,expires_at,access_until) VALUES(?,?,?,?,?,'WAITING_FOR_LOGIN',?,?,?)",
                str(id),str(request.customerId()),str(request.resourceId()),str(request.reservationId()),str(actor.id()),ts(now),ts(expiry),ts(boundary));
        audit.write("GAMING_STATION_ASSIGNED","GAMING_ASSIGNMENT",id,null,Map.of("customerId",request.customerId(),"resourceId",request.resourceId(),"expiresAt",expiry),null,AuditVisibility.MANAGEMENT);
        return assignment(id);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_SESSION_START')")
    public void cancel(UUID id) {
        var ref=assignment(id);UUID customer=UUID.fromString(ref.get("customer_id").toString()),station=UUID.fromString(ref.get("resource_id").toString());
        lockCustomer(customer,false);scope.requireResourceManagement(current.requireCurrentUser(),station,Permission.GAMING_SESSION_START);resources.lockResource(station);
        if(jdbc.update("UPDATE gaming_station_assignments SET status='CANCELLED' WHERE id=? AND status='WAITING_FOR_LOGIN'",str(id))>0)
            audit.write("GAMING_ASSIGNMENT_CANCELLED","GAMING_ASSIGNMENT",id,null,Map.of("status","CANCELLED"),null,AuditVisibility.MANAGEMENT);
    }

    /** Called only after station-bound machine authentication and password validation. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public GamingSession activate(UUID customerId,UUID stationId) {
        if(!stationId.equals(machinePrincipal.requireStationId()))throw fail(HttpStatus.FORBIDDEN,"Machine cannot activate another station");
        lockCustomer(customerId,true);resources.lockGamingStation(stationId);Instant now=clock.instant();
        var existing=sessions.findByCustomerIdAndStatus(customerId,GamingSessionStatus.ACTIVE).orElse(null);
        if(existing!=null) {
            if(!stationId.equals(existing.getResourceId()) || existing.getBillingMode()!=GamingBillingMode.TIME_BALANCE)throw fail(HttpStatus.CONFLICT,"Customer is already playing elsewhere");
            em.refresh(existing,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);settle(existing,now);
            if(existing.getStatus()!=GamingSessionStatus.ACTIVE)throw fail(HttpStatus.CONFLICT,"Session requires a new assignment");
            return existing;
        }
        var rows=jdbc.queryForList("SELECT * FROM gaming_station_assignments WHERE customer_id=? AND resource_id=? AND status='WAITING_FOR_LOGIN' AND expires_at>? FOR UPDATE",str(customerId),str(stationId),ts(now));
        if(rows.isEmpty())throw fail(HttpStatus.CONFLICT,"A valid station assignment is required");
        var a=rows.getFirst();UUID reservation=uuid(a.get("reservation_id"));
        if(sessions.existsByResourceIdAndStatus(stationId,GamingSessionStatus.ACTIVE) || sessions.existsByMoveTargetIdAndStatus(stationId,GamingSessionStatus.ACTIVE))throw fail(HttpStatus.CONFLICT,"Station is occupied");
        readiness.requireManagedClient(stationId);readiness.requireReadyForSession(stationId);
        long seconds=balance(customerId);if(seconds<=0)throw fail(HttpStatus.CONFLICT,"Customer has no gaming time");
        var resource=resources.lockGamingStation(stationId);UUID location=resources.locationId(resource);
        Instant boundary=boundary(stationId,location,customerId,reservation,now);
        Instant end=min(now.plusSeconds(seconds),boundary);availability.requireResourceReservationAvailableForUpdate(stationId,now,end,reservation);
        GamingSession s=new GamingSession();s.setCustomerId(customerId);s.setResourceId(stationId);s.setLocationId(location);s.setReservationId(reservation);s.setStartedBy(uuid(a.get("assigned_by")));
        s.setStartedAt(now);s.setLastBilledAt(now);s.setEndsAt(end);s.setAccessUntil(boundary);s.setMeteredLeaseUntil(min(now.plusSeconds(leaseSeconds),end));s.setBillingMode(GamingBillingMode.TIME_BALANCE);s.setStatus(GamingSessionStatus.ACTIVE);
        s=sessions.saveAndFlush(s);jdbc.update("UPDATE gaming_station_assignments SET status='ACTIVATED',session_id=? WHERE id=?",str(s.getId()),a.get("id"));
        preparation.occupied(stationId,s.getId());long sequence=commands.write(s,StationCommandType.SESSION_STARTED);sessions.saveAndFlush(s);
        audit.writeAttributed(s.getStartedBy(), users.findById(s.getStartedBy()).orElseThrow().getRole(),"GAMING_SESSION_ACTIVATED","GAMING_SESSION",s.getId(),null,Map.of("customerId",customerId,"resourceId",stationId,"startedAt",now),null,AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.GAMING_SESSION_STARTED,"GAMING_SESSION",s.getId(),Map.of("customerId",customerId,"resourceId",stationId,"locationId",location,"endsAt",end,"commandSequence",sequence));
        return s;
    }

    /** No client timestamp is accepted. An expired signed lease is the offline recovery cutoff. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void tick(UUID id,boolean renew,boolean finish) {
        var ref=sessions.findById(id).orElse(null);if(ref==null || ref.getBillingMode()!=GamingBillingMode.TIME_BALANCE)return;
        lockCustomer(ref.getCustomerId(),false);resources.lockResource(ref.getResourceId());em.refresh(ref,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if(ref.getStatus()!=GamingSessionStatus.ACTIVE)return;
        settle(ref,clock.instant());
        if(finish && ref.getStatus()==GamingSessionStatus.ACTIVE)close(ref,GamingSessionStatus.TERMINATED,"Customer finished gaming");
        else if(renew && ref.getStatus()==GamingSessionStatus.ACTIVE)ref.setMeteredLeaseUntil(min(clock.instant().plusSeconds(leaseSeconds),ref.getEndsAt()));
        sessions.saveAndFlush(ref);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void finishByOperator(UUID id,String reason) {
        tick(id,false,true);
        var s=sessions.findById(id).orElseThrow();
        audit.write("GAMING_SESSION_OPERATOR_END","GAMING_SESSION",id,null,Map.of("status",s.getStatus().name()),reason,AuditVisibility.MANAGEMENT);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void recover(UUID id) {
        tick(id,false,false);
        var s=sessions.findById(id).orElse(null);
        if(s!=null && s.getBillingMode()==GamingBillingMode.TIME_BALANCE && s.getStatus()==GamingSessionStatus.ACTIVE)
            close(s,GamingSessionStatus.TERMINATED,"RECOVERY_REQUIRED: Windows Client restarted or lost its active session state");
    }

    /** Caller holds customer, station and session locks. Whole elapsed seconds are charged once. */
    public void settle(GamingSession s,Instant now) {
        if(s.getBillingMode()!=GamingBillingMode.TIME_BALANCE || s.getStatus()!=GamingSessionStatus.ACTIVE)return;
        long available=balance(s.getCustomerId());long delta=unsettled(s,now,available);
        if(delta>0) {
            long total=Math.addExact(s.getBilledSeconds(),delta);
            append(s.getCustomerId(),s.getId(),null,s.getStartedBy(),-delta,"CONSUMPTION",null,"use:"+s.getId()+":"+total);
            s.setBilledSeconds(total);s.setLastBilledAt(s.getLastBilledAt().plusSeconds(delta));
        }
        if(balance(s.getCustomerId())==0 || !now.isBefore(s.getEndsAt()) || !now.isBefore(s.getMeteredLeaseUntil())) {
            boolean recovery=now.isBefore(s.getEndsAt()) && !now.isBefore(s.getMeteredLeaseUntil());
            close(s,recovery?GamingSessionStatus.TERMINATED:GamingSessionStatus.EXPIRED,recovery?"RECOVERY_REQUIRED: signed station lease expired":balance(s.getCustomerId())==0?"Gaming time exhausted":"Station reservation or opening-hours boundary reached");
        }
    }
    private static long unsettled(GamingSession s,Instant now,long balance) {
        Instant cutoff=min(now,min(s.getEndsAt(),s.getMeteredLeaseUntil()));
        return Math.min(balance,Math.max(0,Duration.between(s.getLastBilledAt(),cutoff).getSeconds()));
    }
    private void close(GamingSession s,GamingSessionStatus status,String reason) {
        s.setStatus(status);s.setEndedAt(s.getLastBilledAt());s.setTerminationReason(reason);sessions.saveAndFlush(s);
        long sequence=commands.write(s,StationCommandType.SESSION_TERMINATED);sessions.saveAndFlush(s);
        audit.writeAttributed(s.getStartedBy(),users.findById(s.getStartedBy()).orElseThrow().getRole(),"GAMING_TIME_SESSION_ENDED","GAMING_SESSION",s.getId(),null,Map.of("seconds",s.getBilledSeconds(),"status",status.name()),reason,AuditVisibility.MANAGEMENT);
        outbox.write(status==GamingSessionStatus.EXPIRED?DomainEventType.GAMING_SESSION_EXPIRED:DomainEventType.GAMING_SESSION_TERMINATED,"GAMING_SESSION",s.getId(),Map.of("resourceId",s.getResourceId(),"locationId",s.getLocationId(),"endedAt",s.getEndedAt(),"commandSequence",sequence));
    }
    private void refreshEnd(GamingSession s) {
        long balance=balance(s.getCustomerId());
        if(balance==0){close(s,GamingSessionStatus.EXPIRED,"Gaming time exhausted");return;}
        Instant limit=boundary(s.getResourceId(),s.getLocationId(),s.getCustomerId(),s.getReservationId(),clock.instant());
        Instant end=min(s.getLastBilledAt().plusSeconds(balance),limit);
        s.setEndsAt(end);s.setAccessUntil(limit);
        s.setMeteredLeaseUntil(min(s.getMeteredLeaseUntil(),end));sessions.saveAndFlush(s);
        long sequence=commands.write(s,StationCommandType.SESSION_EXTENDED);sessions.saveAndFlush(s);
        outbox.write(DomainEventType.GAMING_SESSION_EXTENDED,"GAMING_SESSION",s.getId(),Map.of("resourceId",s.getResourceId(),"locationId",s.getLocationId(),"endsAt",end,"commandSequence",sequence));
    }
    private Instant boundary(UUID station,UUID location,UUID customer,UUID reservationId,Instant now) {
        var date=now.atZone(hours.getBusinessZone()).toLocalDate();Instant end=null;
        for(var day:List.of(date.minusDays(1),date)) {
            var window=hours.availabilityWindow(location,day);
            if(window!=null && !now.isBefore(window.open()) && now.isBefore(window.close()) && (end==null || window.close().isAfter(end)))end=window.close();
        }
        if(end==null)throw fail(HttpStatus.CONFLICT,"Location is outside opening hours");
        if(reservationId!=null) {
            var booking=reservations.findByIdForUpdate(reservationId).orElseThrow(()->fail(HttpStatus.CONFLICT,"Reservation not found"));
            if(!customer.equals(booking.getCustomerId()) || !station.equals(booking.getResourceId()) || !location.equals(booking.getLocationId()) || !Set.of(ReservationStatus.CONFIRMED).contains(booking.getStatus()) || now.isBefore(booking.getStartTime()) || !now.isBefore(booking.getEndTime()))throw fail(HttpStatus.CONFLICT,"Reservation does not authorize access now");
            end=min(end,booking.getEndTime());
        }
        var excluded=List.of(ReservationStatus.CANCELLED,ReservationStatus.REJECTED,ReservationStatus.COMPLETED);
        for(var booking:reservations.findResourceConflictingForUpdate(station,now,end,excluded,reservationId)) {
            if(!booking.getStartTime().isAfter(now))throw fail(HttpStatus.CONFLICT,"Station has a current reservation");
            end=min(end,booking.getStartTime());
        }
        return end;
    }
    private GamingSession lockActive(UUID id) {
        var active=sessions.findByCustomerIdAndStatus(id,GamingSessionStatus.ACTIVE).orElse(null);
        if(active!=null){resources.lockResource(active.getResourceId());em.refresh(active,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);}
        return active;
    }
    private void append(UUID customer,UUID session,UUID op,UUID actor,long delta,String kind,String reason,String source) {
        if(hasEntry(source))return;
        jdbc.update("INSERT INTO gaming_time_accounts(customer_id,balance_seconds) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM gaming_time_accounts WHERE customer_id=?)",str(customer),str(customer));
        long before=jdbc.queryForObject("SELECT balance_seconds FROM gaming_time_accounts WHERE customer_id=? FOR UPDATE",Long.class,str(customer));
        long after=Math.addExact(before,delta);if(after<0)throw fail(HttpStatus.CONFLICT,"Operation would create negative gaming time");
        jdbc.update("UPDATE gaming_time_accounts SET balance_seconds=? WHERE customer_id=?",after,str(customer));
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO gaming_time_ledger(id,customer_id,session_id,operation_id,actor_id,delta_seconds,balance_after,kind,reason,source_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",str(id),str(customer),str(session),str(op),str(actor),delta,after,kind,reason,source,ts(clock.instant()));
        if(!"CONSUMPTION".equals(kind))audit.write("GAMING_TIME_"+kind,"GAMING_TIME",id,null,Map.of("customerId",customer,"deltaSeconds",delta,"balanceAfter",after),reason,AuditVisibility.MANAGEMENT);
    }
    public long balance(UUID id) {return jdbc.query("SELECT balance_seconds FROM gaming_time_accounts WHERE customer_id=?",(r,n)->r.getLong(1),str(id)).stream().findFirst().orElse(0L);}
    public Map<String,Object> waiting(UUID station) {return jdbc.queryForList("SELECT * FROM gaming_station_assignments WHERE resource_id=? AND status='WAITING_FOR_LOGIN' AND expires_at>?",str(station),ts(clock.instant())).stream().findFirst().orElse(null);}
    public Map<String,Object> assignment(UUID id) {return jdbc.queryForList("SELECT * FROM gaming_station_assignments WHERE id=?",str(id)).stream().findFirst().orElseThrow(()->fail(HttpStatus.NOT_FOUND,"Assignment not found"));}
    @Transactional public void expireWaiting(Instant now) {jdbc.update("UPDATE gaming_station_assignments SET status='EXPIRED' WHERE status='WAITING_FOR_LOGIN' AND expires_at<=?",ts(now));}
    private boolean hasEntry(String source) {return jdbc.queryForObject("SELECT COUNT(*) FROM gaming_time_ledger WHERE source_key=?",Integer.class,source)>0;}
    private void lockCustomer(UUID id,boolean active) {users.findByIdForUpdate(id).filter(u->u.getRole()==Role.CUSTOMER && (!active || u.isActive() && !u.isDeleted())).orElseThrow(()->fail(HttpStatus.UNPROCESSABLE_ENTITY,"Registered customer is unavailable"));}
    private void requireAccess(UUID id) {
        var actor=current.requireCurrentUser();
        if(actor.role()==Role.CUSTOMER ? !actor.id().equals(id) : !RolePermissions.has(actor.role(),Permission.CUSTOMER_READ) || actor.role()==Role.EMPLOYEE && scope.assignedResources(actor).isEmpty())throw fail(HttpStatus.FORBIDDEN,"Gaming time access denied");
    }
    private UUID financialContext(AuthenticatedUser actor) {
        if(actor.role()==Role.EMPLOYEE)return scope.assignedResources(actor).stream().filter(id->physicalResources.findById(id).map(r->r.getType()==ResourceType.GAMING_PC).orElse(false)).sorted().findFirst().orElseThrow(()->fail(HttpStatus.FORBIDDEN,"No assigned payment location"));
        return jdbc.query("SELECT id FROM physical_resources WHERE resource_type='GAMING_PC' ORDER BY id LIMIT 1",(r,n)->UUID.fromString(r.getString(1))).stream().findFirst().orElse(null);
    }
    private static void requireStaff(AuthenticatedUser actor,Permission permission) {if(actor.role()==Role.CUSTOMER || !RolePermissions.has(actor.role(),permission))throw fail(HttpStatus.FORBIDDEN,"Operation is not authorized");}
    private static ApplicationException fail(HttpStatus status,String message){return new ApplicationException(status,message);}
    private static boolean blank(String s){return s==null || s.isBlank();}
    private static String str(UUID id){return id==null?null:id.toString();}
    private static UUID uuid(Object value){return value==null?null:UUID.fromString(value.toString());}
    private static Timestamp ts(Instant value){return Timestamp.from(value);}
    private static Instant min(Instant a,Instant b){return a.isBefore(b)?a:b;}
}
