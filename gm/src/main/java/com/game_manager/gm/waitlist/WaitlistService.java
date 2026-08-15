package com.game_manager.gm.waitlist;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.notification.NotificationService;
import com.game_manager.gm.reservation.*;
import com.game_manager.gm.reservation.dto.*;
import com.game_manager.gm.user.UserService;
import com.game_manager.gm.waitlist.dto.*;
import com.game_manager.gm.workinghours.WorkingHoursService;
import com.game_manager.gm.resource.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class WaitlistService {
    private static final Duration OFFER_TTL = Duration.ofMinutes(15);
    private final WaitlistEntryRepository entries; private final WaitlistOfferRepository offers;
    private final CurrentUserProvider currentUser; private final CatalogService catalogService;
    private final UserService userService; private final WorkingHoursService workingHours;
    private final ReservationAvailabilityPolicy availability; private final ReservationService reservations;
    private final NotificationService notifications; private final Clock clock;
    private final ResourceManagementService resourceService;

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    public List<WaitlistResponse> listMine(){UUID customer=customer().id();return entries.findByCustomerIdOrderByCreatedAtDesc(customer).stream().map(entry->WaitlistResponse.from(entry,offers.findByEntryIdAndStatus(entry.getId(),WaitlistOfferStatus.OFFERED).orElse(null))).toList();}

    @Transactional @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public WaitlistResponse join(CreateWaitlistRequest request){AuthenticatedUser customer=customer();CatalogItem service=requireService(request.serviceId());
        if(!userService.isActiveEmployee(request.employeeId()))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
        Instant end=request.desiredStart().plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
        if(!request.desiredStart().isAfter(clock.instant()))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Waitlist time must be in the future");
        workingHours.validateWithinWorkingHours(request.desiredStart(),end);
        PhysicalResource resource=request.resourceId()==null?null:resourceService.requireBookable(request.resourceId(),request.serviceId());
        boolean employeeFree=availability.isAvailable(request.employeeId(),request.desiredStart(),end,null);
        boolean resourceFree=resource==null||availability.isResourceAvailable(resource.getId(),request.desiredStart(),end,null);
        if(employeeFree&&resourceFree)throw new ApplicationException(HttpStatus.CONFLICT,"Slot is available and can be reserved directly");
        WaitlistEntry entry=new WaitlistEntry();entry.setCustomerId(customer.id());entry.setEmployeeId(request.employeeId());entry.setServiceId(request.serviceId());entry.setDesiredStart(request.desiredStart());entry.setDesiredEnd(end);if(resource!=null){entry.setResourceId(resource.getId());entry.setLocationId(resourceService.locationId(resource));}entry.setStatus(WaitlistStatus.WAITING);entry.setActiveKey(activeKey(customer.id(),request));
        try{return WaitlistResponse.from(entries.saveAndFlush(entry),null);}catch(org.springframework.dao.DataIntegrityViolationException e){throw new ApplicationException(HttpStatus.CONFLICT,"An active waitlist entry already exists");}}

    @Transactional @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public WaitlistResponse accept(UUID offerId){AuthenticatedUser customer=customer();WaitlistOffer offer=offers.findLocked(offerId).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist offer not found"));WaitlistEntry entry=offer.getEntry();
        if(!entry.getCustomerId().equals(customer.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist offer not found");
        if(offer.getStatus()==WaitlistOfferStatus.ACCEPTED)return WaitlistResponse.from(entry,offer);
        if(offer.getStatus()!=WaitlistOfferStatus.OFFERED||!offer.getExpiresAt().isAfter(clock.instant())){expire(offer);throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist offer has expired");}
        ReservationResponse reservation=reservations.create(new CreateReservationRequest(offer.getEmployeeId(),entry.getServiceId(),offer.getResourceId(),entry.getDesiredStart(),"Waitlist offer"));
        offer.setStatus(WaitlistOfferStatus.ACCEPTED);offer.setReservationId(reservation.id());offer.setActiveKey(null);entry.setStatus(WaitlistStatus.ACCEPTED);entry.setActiveKey(null);offers.saveAndFlush(offer);return WaitlistResponse.from(entry,offer);}

    @Transactional @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public void cancel(UUID id,long version){AuthenticatedUser customer=customer();WaitlistEntry entry=entries.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found"));
        if(!entry.getCustomerId().equals(customer.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found");if(!Objects.equals(entry.getVersion(),version))throw new ApplicationException(HttpStatus.CONFLICT,"Waitlist entry was changed; refresh and try again");if(entry.getStatus()==WaitlistStatus.ACCEPTED)throw new ApplicationException(HttpStatus.CONFLICT,"Accepted waitlist entry cannot be cancelled");offers.findByEntryIdAndStatus(id,WaitlistOfferStatus.OFFERED).ifPresent(this::expire);entry.setStatus(WaitlistStatus.CANCELLED);entry.setActiveKey(null);}

    @Scheduled(fixedDelayString="${app.waitlist.match-delay-ms:60000}") @Transactional
    public void matchAvailable(){Instant now=clock.instant();offers.findByStatusAndExpiresAtLessThanEqual(WaitlistOfferStatus.OFFERED,now).forEach(this::expire);
        for(WaitlistEntry entry:entries.findByStatusOrderByCreatedAtAsc(WaitlistStatus.WAITING,PageRequest.of(0,100))){CatalogItem service=requireService(entry.getServiceId());Instant end=entry.getDesiredStart().plus(service.getDurationMinutes(),ChronoUnit.MINUTES);if(!entry.getDesiredStart().isAfter(now)||!availability.isAvailable(entry.getEmployeeId(),entry.getDesiredStart(),end,null)||(entry.getResourceId()!=null&&!availability.isResourceAvailable(entry.getResourceId(),entry.getDesiredStart(),end,null))||offers.existsByStatusAndEmployeeIdAndEntry_DesiredStart(WaitlistOfferStatus.OFFERED,entry.getEmployeeId(),entry.getDesiredStart()))continue;WaitlistOffer offer=new WaitlistOffer();offer.setEntry(entry);offer.setEmployeeId(entry.getEmployeeId());offer.setResourceId(entry.getResourceId());offer.setExpiresAt(now.plus(OFFER_TTL));offer.setStatus(WaitlistOfferStatus.OFFERED);offer.setActiveKey(entry.getId());offers.saveAndFlush(offer);entry.setStatus(WaitlistStatus.OFFERED);notifications.waitlistOffer(entry.getCustomerId(),offer.getId());}}

    private void expire(WaitlistOffer offer){offer.setStatus(WaitlistOfferStatus.EXPIRED);offer.setActiveKey(null);WaitlistEntry entry=offer.getEntry();if(entry.getStatus()==WaitlistStatus.OFFERED)entry.setStatus(WaitlistStatus.WAITING);}
    private CatalogItem requireService(UUID id){CatalogItem item=catalogService.getActiveById(id);if(item.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");return item;}
    private AuthenticatedUser customer(){AuthenticatedUser actor=currentUser.requireCurrentUser();if(actor.role()!=Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Only customers can use the waitlist");return actor;}
    private String activeKey(UUID customer,CreateWaitlistRequest request){return customer+":"+request.serviceId()+":"+request.employeeId()+":"+request.resourceId()+":"+request.desiredStart();}
}
