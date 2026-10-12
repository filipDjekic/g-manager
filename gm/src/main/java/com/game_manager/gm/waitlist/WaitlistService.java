package com.game_manager.gm.waitlist;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.notification.NotificationService;
import com.game_manager.gm.reservation.*;
import com.game_manager.gm.reservation.dto.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.user.*;
import com.game_manager.gm.waitlist.dto.*;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WaitlistService {
    private static final Duration OFFER_TTL=Duration.ofMinutes(15);
    private final WaitlistEntryRepository entries;
    private final WaitlistOfferRepository offers;
    private final CurrentUserProvider currentUser;
    private final CatalogService catalogService;
    private final UserService userService;
    private final UserRepository users;
    private final CatalogRepository catalog;
    private final WorkingHoursService workingHours;
    private final BookingAvailabilityPolicy bookingPolicy;
    private final ReservationService reservations;
    private final NotificationService notifications;
    private final Clock clock;
    private final ResourceManagementService resourceService;
    private final ResourceAccessService resourceAccess;
    private final jakarta.persistence.EntityManager entityManager;
    private final WaitlistQueries queries;
    private final WaitlistAccessPolicy accessPolicy;
    private final WaitlistHistory history;
    private final com.game_manager.gm.audit.AuditWriter audit;

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<WaitlistOperationalResponse> operational(WaitlistStatus status,String search,UUID customerId,
            LocalDate date,UUID locationId,UUID resourceId,int page,int size) {
        return queries.page(currentUser.requireCurrentUser(),status==null?null:status.name(),search,customerId,
                date,null,locationId,null,resourceId,"FIFO",page,size);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<WaitlistOperationalResponse> operational(String status,String search,UUID customerId,
            LocalDate date,UUID serviceId,UUID locationId,UUID areaId,UUID resourceId,String sort,int page,int size) {
        return queries.page(currentUser.requireCurrentUser(),status,search,customerId,date,serviceId,locationId,areaId,resourceId,sort,page,size);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public WaitlistStatistics statistics() { return queries.statistics(currentUser.requireCurrentUser()); }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public WaitlistAccessPolicy.Scope managementScope() { return accessPolicy.scope(currentUser.requireCurrentUser()); }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public WaitlistDetailResponse detail(UUID id) {
        var entry=queries.detail(currentUser.requireCurrentUser(),id);
        return new WaitlistDetailResponse(entry,history.list(id));
    }

    @Transactional
    @PreAuthorize("hasAuthority('WAITLIST_MANAGE')")
    public WaitlistDetailResponse createManaged(ManageWaitlistRequest request) {
        AuthenticatedUser actor=staff();
        if(request.customerId()==null||!Boolean.TRUE.equals(request.customerConsent()))
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Customer and customer consent are required");
        requireCustomer(request.customerId());
        var state=validateManaged(actor,request);
        String key=managedKey(request.customerId(),request,state);
        if(entries.existsByActiveKey(key))duplicate();
        Instant now=clock.instant();
        WaitlistEntry entry=new WaitlistEntry();
        entry.setCustomerId(request.customerId());entry.setStatus(WaitlistStatus.WAITING);
        applyManaged(entry,request,state);entry.setActiveKey(key);entry.setQueueEnteredAt(now);
        entry.setCreatedById(actor.id());entry.setConsentAt(now);entry.setStatusChangedAt(now);
        saveManaged(entry);
        history.record(entry,"ENTRY_CREATED",actor.id(),null,null);
        audit.write("WAITLIST_CREATED","WAITLIST",entry.getId(),null,snapshot(entry),null,
                com.game_manager.gm.audit.AuditVisibility.MANAGEMENT);
        return new WaitlistDetailResponse(queries.detail(actor,entry.getId()),history.list(entry.getId()));
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('WAITLIST_MANAGE')")
    public WaitlistDetailResponse updateManaged(UUID id,ManageWaitlistRequest request) {
        AuthenticatedUser actor=staff();accessPolicy.requireRead(actor,id);
        WaitlistEntry entry=lockEntry(id);
        requireSourceScope(actor,entry);
        requireVersion(entry,request.version());
        if(entry.getStatus()!=WaitlistStatus.WAITING)
            throw new ApplicationException(HttpStatus.CONFLICT,"Only waiting entries can be edited");
        if(request.customerId()!=null&&!entry.getCustomerId().equals(request.customerId()))
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Waitlist customer cannot be changed");
        requireCustomer(entry.getCustomerId());
        var state=validateManaged(actor,request);
        String key=managedKey(entry.getCustomerId(),request,state);
        if(!Objects.equals(entry.getActiveKey(),key)&&entries.existsByActiveKey(key))duplicate();
        Map<String,Object> before=snapshot(entry);
        boolean changed=!Objects.equals(entry.getServiceId(),request.serviceId())
            ||!Objects.equals(entry.getEmployeeId(),request.employeeId())
            ||!Objects.equals(entry.getResourceId(),request.resourceId())
            ||!Objects.equals(entry.getLocationId(),request.resourceId()==null?request.locationId():state.locationId())
            ||request.resourceId()==null&&!Objects.equals(entry.getAreaId(),request.areaId())
            ||!Objects.equals(entry.getDesiredStart(),request.desiredStart());
        applyManaged(entry,request,state);entry.setActiveKey(key);
        if(changed)entry.setQueueEnteredAt(clock.instant());
        saveManaged(entry);
        history.record(entry,"ENTRY_UPDATED",actor.id(),null,changed?"Promenjeni uslovi čekanja; novo mesto u redu.":"Izmenjena interna napomena.");
        audit.write("WAITLIST_UPDATED","WAITLIST",id,before,snapshot(entry),null,
                com.game_manager.gm.audit.AuditVisibility.MANAGEMENT);
        return new WaitlistDetailResponse(queries.detail(actor,id),history.list(id));
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('WAITLIST_MANAGE')")
    public void cancelManaged(UUID id,CancelWaitlistRequest request) {
        AuthenticatedUser actor=staff();accessPolicy.requireRead(actor,id);
        WaitlistEntry entry=lockEntry(id);requireSourceScope(actor,entry);requireVersion(entry,request.version());
        if(entry.getStatus()!=WaitlistStatus.WAITING&&entry.getStatus()!=WaitlistStatus.OFFERED)
            throw new ApplicationException(HttpStatus.CONFLICT,"Only waiting or offered entries can be cancelled");
        Map<String,Object> before=snapshot(entry);
        offers.findByEntryIdAndStatus(id,WaitlistOfferStatus.OFFERED).ifPresent(value->{
            WaitlistOffer offer=lockOffer(value.getId());
            if(offer.getStatus()==WaitlistOfferStatus.OFFERED) {
                offer.setStatus(WaitlistOfferStatus.EXPIRED);offer.setActiveKey(null);
                history.record(entry,"OFFER_INVALIDATED",actor.id(),offer.getId(),request.reason().trim());
            }
        });
        entry.setStatus(WaitlistStatus.CANCELLED);entry.setActiveKey(null);entry.setStatusChangedAt(clock.instant());
        entries.saveAndFlush(entry);offers.flush();
        history.record(entry,"ENTRY_CANCELLED",actor.id(),null,request.reason().trim());
        audit.write("WAITLIST_CANCELLED","WAITLIST",id,before,snapshot(entry),request.reason(),
                com.game_manager.gm.audit.AuditVisibility.MANAGEMENT);
        notifications.waitlistCancelled(entry.getCustomerId(),id);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    public List<WaitlistResponse> listMine() {
        UUID customer=customer().id();
        Map<UUID,WaitlistOffer> latest=new HashMap<>();
        offers.customerOffers(customer).forEach(offer->latest.putIfAbsent(offer.getEntry().getId(),offer));
        List<WaitlistResponse> rows=entries.findByCustomerIdOrderByCreatedAtDesc(customer).stream()
                .map(entry->WaitlistResponse.from(entry,latest.get(entry.getId()))).toList();
        if(rows.isEmpty())return rows;
        var services=catalogService.getReferences(rows.stream().map(WaitlistResponse::serviceId).collect(Collectors.toSet()));
        var employeeNames=users.findAllById(rows.stream().map(WaitlistResponse::employeeId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(User::getId,User::getName));
        var refs=resourceService.resourceReferences(rows.stream().map(WaitlistResponse::resourceId).filter(Objects::nonNull).collect(Collectors.toSet()));
        var locations=resourceService.locationNames(rows.stream().map(WaitlistResponse::locationId).filter(Objects::nonNull).collect(Collectors.toSet()));
        Instant now=clock.instant();
        return rows.stream().map(row->{var ref=row.resourceId()==null?null:refs.get(row.resourceId());var service=services.get(row.serviceId());
            return row.enriched(service==null?null:service.name(),employeeNames.get(row.employeeId()),ref==null?row.locationId():ref.locationId(),
                    ref==null?(row.locationId()==null?null:locations.get(row.locationId())):ref.locationName(),ref==null?null:ref.code(),ref==null?null:ref.name(),now);}).toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public WaitlistResponse join(CreateWaitlistRequest request) {
        AuthenticatedUser customer=customer();String key=activeKey(customer.id(),request);
        if(entries.existsByActiveKey(key))throw new ApplicationException(HttpStatus.CONFLICT,"An active waitlist entry already exists");
        CatalogItem service=requireService(request.serviceId());
        if(!userService.isActiveEmployee(request.employeeId()))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
        Instant start=request.desiredStart(),end=start.plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
        if(!start.isAfter(clock.instant()))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Waitlist time must be in the future");
        var state=bookingPolicy.prepare(service.getId(),request.resourceId(),request.locationId(),List.of(request.employeeId()),start,end,null)
                .assess(request.employeeId(),start,end);
        if(state.available())throw new ApplicationException(HttpStatus.CONFLICT,"Slot is available and can be reserved directly");
        if(!state.status().occupied())throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,state.reason());
        WaitlistEntry entry=new WaitlistEntry();entry.setCustomerId(customer.id());entry.setEmployeeId(request.employeeId());
        entry.setServiceId(request.serviceId());entry.setDesiredStart(start);entry.setDesiredEnd(end);
        // Keep an explicit resource only when requested; location preferences remain flexible for legacy/API clients.
        entry.setResourceId(request.resourceId());entry.setLocationId(request.resourceId()==null?request.locationId():state.locationId());
        entry.setStatus(WaitlistStatus.WAITING);entry.setActiveKey(key);
        entry.setQueueEnteredAt(clock.instant());entry.setStatusChangedAt(clock.instant());entry.setCreatedById(customer.id());
        try{
            entries.saveAndFlush(entry);history.record(entry,"ENTRY_CREATED",customer.id(),null,null);
            return WaitlistResponse.from(entry,null);
        }
        catch(org.springframework.dao.DataIntegrityViolationException ex){throw new ApplicationException(HttpStatus.CONFLICT,"An active waitlist entry already exists");}
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public WaitlistResponse accept(UUID offerId) {
        AuthenticatedUser customer=customer();
        WaitlistOffer reference=offers.findById(offerId).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist offer not found"));
        WaitlistEntry entry=lockEntry(reference.getEntry().getId());
        if(!entry.getCustomerId().equals(customer.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist offer not found");
        WaitlistOffer offer=lockOffer(offerId);
        if(offer.getStatus()==WaitlistOfferStatus.ACCEPTED)return WaitlistResponse.from(entry,offer);
        if(entry.getStatus()!=WaitlistStatus.OFFERED||offer.getStatus()!=WaitlistOfferStatus.OFFERED||!offer.getExpiresAt().isAfter(clock.instant()))
            throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist offer has expired or is no longer active");
        ReservationResponse reservation=reservations.create(new CreateReservationRequest(offer.getEmployeeId(),entry.getServiceId(),
                offer.getResourceId(),entry.getDesiredStart(),"Waitlist offer",entry.getLocationId()));
        offer.setStatus(WaitlistOfferStatus.ACCEPTED);offer.setReservationId(reservation.id());offer.setActiveKey(null);
        entry.setStatus(WaitlistStatus.ACCEPTED);entry.setActiveKey(null);entry.setStatusChangedAt(clock.instant());
        entries.saveAndFlush(entry);offers.saveAndFlush(offer);
        history.record(entry,"OFFER_ACCEPTED",customer.id(),offer.getId(),null);
        return WaitlistResponse.from(entry,offer);
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public void cancel(UUID id,long version) {
        AuthenticatedUser customer=customer();WaitlistEntry entry=lockEntry(id);
        if(!entry.getCustomerId().equals(customer.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found");
        if(!Objects.equals(entry.getVersion(),version))throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist entry was changed; refresh and try again");
        if(entry.getStatus()==WaitlistStatus.ACCEPTED)throw new ApplicationException(HttpStatus.CONFLICT,"Accepted waitlist entry cannot be cancelled");
        if(entry.getStatus()==WaitlistStatus.CANCELLED)return;
        offers.findByEntryIdAndStatus(id,WaitlistOfferStatus.OFFERED).ifPresent(value->{
            WaitlistOffer offer=lockOffer(value.getId());
            if(offer.getStatus()==WaitlistOfferStatus.OFFERED) {
                offer.setStatus(WaitlistOfferStatus.EXPIRED);offer.setActiveKey(null);
                history.record(entry,"OFFER_INVALIDATED",customer.id(),offer.getId(),null);
            }
        });
        entry.setStatus(WaitlistStatus.CANCELLED);entry.setActiveKey(null);entry.setStatusChangedAt(clock.instant());
        history.record(entry,"ENTRY_CANCELLED",customer.id(),null,null);
    }

    @Scheduled(fixedDelayString="${app.waitlist.match-delay-ms:60000}")
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void matchAvailable() {
        Instant now=clock.instant();
        for(WaitlistOffer reference:offers.findByStatusAndExpiresAtLessThanEqual(WaitlistOfferStatus.OFFERED,now)) {
            lockEntry(reference.getEntry().getId());
            WaitlistOffer offer=lockOffer(reference.getId());
            if(offer.getStatus()==WaitlistOfferStatus.OFFERED&&!offer.getExpiresAt().isAfter(now))expire(offer);
        }
        offers.flush();entries.flush();
        // Serialize concurrent matchers on the FIFO queue, before issuing any offer or notification.
        Instant afterCreated=null;UUID afterId=null;
        while(true){
            List<WaitlistEntry> waiting=entries.waitingForUpdate(now,afterCreated,afterId,PageRequest.of(0,100));
            if(waiting.isEmpty())break;
            matchBatch(waiting,now);
            WaitlistEntry last=waiting.getLast();afterCreated=last.getQueueEnteredAt();afterId=last.getId();
        }
    }

    private void matchBatch(List<WaitlistEntry> waiting,Instant now) {
        Set<UUID> employeeIds=waiting.stream().map(WaitlistEntry::getEmployeeId).collect(Collectors.toSet());
        Set<UUID> activeEmployees=users.findAllById(employeeIds).stream().filter(v->v.isActive()&&!v.isDeleted()&&v.getRole()==Role.EMPLOYEE)
                .map(User::getId).collect(Collectors.toSet());
        Map<UUID,CatalogItem> services=catalog.findAllById(waiting.stream().map(WaitlistEntry::getServiceId).collect(Collectors.toSet())).stream()
                .filter(v->v.isActive()&&v.getDeletedAt()==null&&v.getType()==ItemType.SERVICE)
                .collect(Collectors.toMap(CatalogItem::getId,java.util.function.Function.identity()));
        Map<String,BookingAvailabilityPolicy.Snapshot> snapshots=new HashMap<>();
        for(WaitlistEntry entry:waiting) {
            entityManager.refresh(entry,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            if(entry.getStatus()!=WaitlistStatus.WAITING||!activeEmployees.contains(entry.getEmployeeId())||!services.containsKey(entry.getServiceId()))continue;
            try {
                CatalogItem service=services.get(entry.getServiceId());
                Instant end=entry.getDesiredStart().plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
                LocalDate day=entry.getDesiredStart().atZone(workingHours.getBusinessZone()).toLocalDate();
                String key=entry.getServiceId()+":"+entry.getResourceId()+":"+entry.getLocationId()+":"+entry.getAreaId()+":"+day;
                var snapshot=snapshots.computeIfAbsent(key,ignored->bookingPolicy.prepare(entry.getServiceId(),entry.getResourceId(),entry.getLocationId(),
                        employeeIds,day.atStartOfDay(workingHours.getBusinessZone()).toInstant(),
                        day.plusDays(1).atStartOfDay(workingHours.getBusinessZone()).toInstant().plus(service.getDurationMinutes(),ChronoUnit.MINUTES),null,null,entry.getAreaId()));
                var state=snapshot.assess(entry.getEmployeeId(),entry.getDesiredStart(),end);
                if(!state.available())continue;
                UUID resourceId=state.resource()==null?null:state.resource().id();
                if(offers.overlappingOffers(entry.getEmployeeId(),resourceId,entry.getDesiredStart(),end,now)>0)continue;
                WaitlistOffer offer=new WaitlistOffer();offer.setEntry(entry);offer.setEmployeeId(entry.getEmployeeId());
                offer.setResourceId(resourceId);offer.setExpiresAt(now.plus(OFFER_TTL));offer.setStatus(WaitlistOfferStatus.OFFERED);offer.setActiveKey(entry.getId());
                entry.setDesiredEnd(end);entry.setStatus(WaitlistStatus.OFFERED);entry.setStatusChangedAt(now);offers.saveAndFlush(offer);
                history.record(entry,"OFFER_CREATED",null,offer.getId(),null);
                notifications.waitlistOffer(entry.getCustomerId(),offer.getId());
            } catch(ApplicationException ex) {
                if(ex.getStatus()!=HttpStatus.NOT_FOUND&&ex.getStatus()!=HttpStatus.UNPROCESSABLE_ENTITY)throw ex;
                // Removed services/resources must not prevent other customers from receiving offers.
            }
        }
    }

    private WaitlistEntry lockEntry(UUID id) {
        WaitlistEntry entry=entries.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found"));
        entityManager.refresh(entry,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);return entry;
    }
    private WaitlistOffer lockOffer(UUID id) {
        WaitlistOffer offer=offers.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist offer not found"));
        entityManager.refresh(offer,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);return offer;
    }
    private void expire(WaitlistOffer offer) {
        if(offer.getStatus()!=WaitlistOfferStatus.OFFERED)return;
        offer.setStatus(WaitlistOfferStatus.EXPIRED);offer.setActiveKey(null);
        if(offer.getEntry().getStatus()==WaitlistStatus.OFFERED) {
            offer.getEntry().setStatus(WaitlistStatus.WAITING);offer.getEntry().setStatusChangedAt(clock.instant());
        }
        history.record(offer.getEntry(),"OFFER_EXPIRED",null,offer.getId(),null);
    }
    private AuthenticatedUser staff() {
        var actor=currentUser.requireCurrentUser();
        if(actor.role()==Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Staff access is required");
        return actor;
    }
    private void requireCustomer(UUID id) {
        users.findById(id).filter(value->value.getRole()==Role.CUSTOMER&&value.isActive()&&!value.isDeleted())
            .orElseThrow(()->new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Customer is not available for booking"));
    }
    private BookingAvailabilityPolicy.Assessment validateManaged(AuthenticatedUser actor,ManageWaitlistRequest request) {
        CatalogItem service=requireService(request.serviceId());
        if(!userService.isActiveEmployee(request.employeeId()))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
        Instant start=request.desiredStart(),end=start.plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
        if(!start.isAfter(clock.instant()))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Waitlist time must be in the future");
        resourceService.requireBookingArea(request.areaId(),request.locationId());
        if(request.areaId()!=null&&request.locationId()==null)
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Location is required for an area preference");
        accessPolicy.requireUpdate(actor,request.employeeId(),request.serviceId(),request.locationId(),request.areaId(),request.resourceId());
        var state=bookingPolicy.prepare(service.getId(),request.resourceId(),request.locationId(),List.of(request.employeeId()),
                start,end,null,null,request.areaId()).assess(request.employeeId(),start,end);
        if(state.available())throw new ApplicationException(HttpStatus.CONFLICT,"Slot is available and can be reserved directly");
        if(!state.status().occupied())throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,state.reason());
        return state;
    }
    private void requireSourceScope(AuthenticatedUser actor,WaitlistEntry entry) {
        accessPolicy.requireUpdate(actor,entry.getEmployeeId(),entry.getServiceId(),entry.getLocationId(),entry.getAreaId(),entry.getResourceId());
        offers.findByEntryIdAndStatus(entry.getId(),WaitlistOfferStatus.OFFERED).ifPresent(offer->{
            if(offer.getResourceId()!=null)resourceAccess.requireManageForUpdate(actor,List.of(offer.getResourceId()),Permission.WAITLIST_MANAGE);
        });
    }
    private void requireVersion(WaitlistEntry entry,Long version) {
        if(version==null||!Objects.equals(entry.getVersion(),version))
            throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist entry was changed; refresh and try again");
    }
    private void applyManaged(WaitlistEntry entry,ManageWaitlistRequest request,BookingAvailabilityPolicy.Assessment state) {
        entry.setEmployeeId(request.employeeId());entry.setServiceId(request.serviceId());entry.setResourceId(request.resourceId());
        entry.setLocationId(request.resourceId()==null?request.locationId():state.locationId());entry.setAreaId(request.areaId());
        entry.setDesiredStart(request.desiredStart());
        entry.setDesiredEnd(request.desiredStart().plus(requireService(request.serviceId()).getDurationMinutes(),ChronoUnit.MINUTES));
        entry.setInternalNote(request.internalNote()==null||request.internalNote().isBlank()?null:request.internalNote().trim());
    }
    private String managedKey(UUID customer,ManageWaitlistRequest request,BookingAvailabilityPolicy.Assessment state) {
        String key=activeKey(customer,new CreateWaitlistRequest(request.serviceId(),request.employeeId(),request.resourceId(),
                request.desiredStart(),request.resourceId()==null?request.locationId():state.locationId()));
        return request.resourceId()==null&&request.areaId()!=null?key+":"+request.areaId():key;
    }
    private void saveManaged(WaitlistEntry entry) {
        try{entries.saveAndFlush(entry);}catch(org.springframework.dao.DataIntegrityViolationException ex){duplicate();}
    }
    private void duplicate() { throw new ApplicationException(HttpStatus.CONFLICT,"An active waitlist entry already exists"); }
    private Map<String,Object> snapshot(WaitlistEntry entry) {
        Map<String,Object> values=new LinkedHashMap<>();
        values.put("customerId",entry.getCustomerId());values.put("serviceId",entry.getServiceId());
        values.put("employeeId",entry.getEmployeeId());values.put("locationId",entry.getLocationId());
        values.put("areaId",entry.getAreaId());values.put("resourceId",entry.getResourceId());
        values.put("desiredStart",entry.getDesiredStart());values.put("desiredEnd",entry.getDesiredEnd());
        values.put("status",entry.getStatus());values.put("queueEnteredAt",entry.getQueueEnteredAt());
        values.put("internalNote",entry.getInternalNote());values.put("consentAt",entry.getConsentAt());return values;
    }
    private CatalogItem requireService(UUID id) {
        CatalogItem item=catalogService.getActiveById(id);
        if(item.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");return item;
    }
    private AuthenticatedUser customer() {
        AuthenticatedUser actor=currentUser.requireCurrentUser();
        if(actor.role()!=Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Only customers can use the waitlist");return actor;
    }
    private String activeKey(UUID customer,CreateWaitlistRequest request) {
        return customer+":"+request.serviceId()+":"+request.employeeId()+":"+request.resourceId()+":"+request.desiredStart()
                +(request.resourceId()==null&&request.locationId()!=null?":"+request.locationId():"");
    }
}
