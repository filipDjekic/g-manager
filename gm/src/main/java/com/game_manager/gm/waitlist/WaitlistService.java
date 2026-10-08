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

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<WaitlistOperationalResponse> operational(WaitlistStatus status,String search,UUID customerId,
            LocalDate date,UUID locationId,UUID resourceId,int page,int size) {
        AuthenticatedUser actor=currentUser.requireCurrentUser();
        String value=search==null?"":search.trim().toLowerCase(Locale.ROOT);
        if(value.length()>100)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Search is too long");
        Instant now=clock.instant();
        Instant from=date==null?(status==null?now:null):date.atStartOfDay(workingHours.getBusinessZone()).toInstant();
        Instant to=date==null?null:date.plusDays(1).atStartOfDay(workingHours.getBusinessZone()).toInstant();
        Set<UUID> assignments=resourceAccess.assignedResources(actor);
        var result=entries.operational(status==null?List.of(WaitlistStatus.WAITING,WaitlistStatus.OFFERED):List.of(status),
                now,from,to,customerId,locationId,resourceId,value.isEmpty()?"":"%"+value+"%",
                PageRequest.of(Math.max(0,page),Math.min(100,Math.max(1,size))));
        return PageResponse.from(result.map(row->row.withAccess(now,resourceAccess.canManage(actor,row.resourceId(),assignments))));
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
        try{return WaitlistResponse.from(entries.saveAndFlush(entry),null);}
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
        entry.setStatus(WaitlistStatus.ACCEPTED);entry.setActiveKey(null);entries.saveAndFlush(entry);offers.saveAndFlush(offer);
        return WaitlistResponse.from(entry,offer);
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public void cancel(UUID id,long version) {
        AuthenticatedUser customer=customer();WaitlistEntry entry=lockEntry(id);
        if(!entry.getCustomerId().equals(customer.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found");
        if(!Objects.equals(entry.getVersion(),version))throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist entry was changed; refresh and try again");
        if(entry.getStatus()==WaitlistStatus.ACCEPTED)throw new ApplicationException(HttpStatus.CONFLICT,"Accepted waitlist entry cannot be cancelled");
        offers.findByEntryIdAndStatus(id,WaitlistOfferStatus.OFFERED).ifPresent(value->expire(lockOffer(value.getId())));
        entry.setStatus(WaitlistStatus.CANCELLED);entry.setActiveKey(null);
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
            WaitlistEntry last=waiting.getLast();afterCreated=last.getCreatedAt();afterId=last.getId();
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
            if(entry.getStatus()!=WaitlistStatus.WAITING||!activeEmployees.contains(entry.getEmployeeId())||!services.containsKey(entry.getServiceId()))continue;
            try {
                CatalogItem service=services.get(entry.getServiceId());
                Instant end=entry.getDesiredStart().plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
                LocalDate day=entry.getDesiredStart().atZone(workingHours.getBusinessZone()).toLocalDate();
                String key=entry.getServiceId()+":"+entry.getResourceId()+":"+entry.getLocationId()+":"+day;
                var snapshot=snapshots.computeIfAbsent(key,ignored->bookingPolicy.prepare(entry.getServiceId(),entry.getResourceId(),entry.getLocationId(),
                        employeeIds,day.atStartOfDay(workingHours.getBusinessZone()).toInstant(),
                        day.plusDays(1).atStartOfDay(workingHours.getBusinessZone()).toInstant().plus(service.getDurationMinutes(),ChronoUnit.MINUTES),null));
                var state=snapshot.assess(entry.getEmployeeId(),entry.getDesiredStart(),end);
                if(!state.available())continue;
                UUID resourceId=state.resource()==null?null:state.resource().id();
                if(offers.overlappingOffers(entry.getEmployeeId(),resourceId,entry.getDesiredStart(),end,now)>0)continue;
                WaitlistOffer offer=new WaitlistOffer();offer.setEntry(entry);offer.setEmployeeId(entry.getEmployeeId());
                offer.setResourceId(resourceId);offer.setExpiresAt(now.plus(OFFER_TTL));offer.setStatus(WaitlistOfferStatus.OFFERED);offer.setActiveKey(entry.getId());
                entry.setDesiredEnd(end);entry.setStatus(WaitlistStatus.OFFERED);offers.saveAndFlush(offer);
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
        offer.setStatus(WaitlistOfferStatus.EXPIRED);offer.setActiveKey(null);
        if(offer.getEntry().getStatus()==WaitlistStatus.OFFERED)offer.getEntry().setStatus(WaitlistStatus.WAITING);
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
