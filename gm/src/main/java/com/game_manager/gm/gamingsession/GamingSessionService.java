package com.game_manager.gm.gamingsession;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.events.*;
import com.game_manager.gm.gamingsession.dto.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.reservation.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.user.*;
import com.game_manager.gm.station.StationReadinessService;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GamingSessionService {
    private final com.game_manager.gm.gamingsession.billing.GamingBillingService billing;
    private final com.game_manager.gm.station.StationPreparationService preparation;
    private final com.game_manager.gm.common.scheduling.ClientStatePort clientState;
    private final GamingSessionRepository sessions;
    private final UserRepository users;
    private final ResourceManagementService resources;
    private final StationReadinessService stationReadiness;
    private final ReservationRepository reservations;
    private final ReservationAvailabilityPolicy bookingAvailability;
    private final jakarta.persistence.EntityManager entityManager;
    private final GamingSessionTransitionPolicy transitions;
    private final GamingSessionLocationPolicy locations;
    private final CurrentUserProvider currentUser;
    private final Clock clock;
    private final AuditWriter audit;
    private final OutboxWriter outbox;
    private final StationCommandWriter commands;

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('GAMING_SESSION_START')")
    public GamingSessionResponse start(StartGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        if (request.durationMinutes()==null || request.durationMinutes()<billing.policy().minimumMinutes() || request.durationMinutes()>billing.policy().maximumMinutes())
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Duration is outside configured billing policy");
        Duration duration = Duration.ofMinutes(request.durationMinutes());
        if(request.customerId()==null && (request.reservationId()!=null || request.guestName()==null || request.guestName().isBlank()))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Guest label is required and guest sessions cannot claim customer reservations");
        if(request.customerId()!=null && request.guestName()!=null)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Choose guest or registered customer");
        locations.requireResourceManagement(actor,request.resourceId(),Permission.GAMING_SESSION_START);

        // Every start locks customer first and resource second. This order is invariant.
        User customer = request.customerId()==null ? null : users.findByIdForUpdate(request.customerId())
                .filter(value -> value.getRole() == Role.CUSTOMER && value.isActive() && !value.isDeleted())
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Customer is not available for a gaming session"));
        PhysicalResource resource = resources.lockGamingStation(request.resourceId());
        UUID locationId = resources.locationId(resource);

        if (customer!=null && sessions.existsByCustomerIdAndStatus(customer.getId(), GamingSessionStatus.ACTIVE))
            throw new ApplicationException(HttpStatus.CONFLICT, "Customer already has an active gaming session");
        if (sessions.existsByResourceIdAndStatus(resource.getId(), GamingSessionStatus.ACTIVE) || sessions.existsByMoveTargetIdAndStatus(resource.getId(),GamingSessionStatus.ACTIVE))
            throw new ApplicationException(HttpStatus.CONFLICT, "Station already has an active gaming session");
        stationReadiness.requireReadyForSession(resource.getId());
        if(customer==null) stationReadiness.requireGuestClient(resource.getId());
        Reservation reservation = validateReservation(request.reservationId(), request.customerId(),
                resource.getId(), locationId);
        Instant now = clock.instant();
        bookingAvailability.requireResourceReservationAvailableForUpdate(resource.getId(),now,now.plus(duration),
                reservation==null?null:reservation.getId());
        GamingSession session = new GamingSession();
        session.setCustomerId(request.customerId()); session.setGuestName(customer==null?request.guestName().trim():null); session.setResourceId(resource.getId());
        session.setLocationId(locationId); session.setReservationId(reservation == null ? null : reservation.getId());
        session.setStartedBy(actor.id()); session.setStartedAt(now); session.setEndsAt(now.plus(duration));
        session.setStatus(GamingSessionStatus.ACTIVE); session = sessions.saveAndFlush(session);
        billing.charge(session,request.durationMinutes(),request.purchase());
        preparation.occupied(session.getResourceId(),session.getId());
        long commandSequence = commands.write(session, StationCommandType.SESSION_STARTED);
        session = sessions.saveAndFlush(session);
        audit.write("GAMING_SESSION_STARTED", "GAMING_SESSION", session.getId(), null,
                Map.of("identity", customer==null?"GUEST":customer.getId(), "resourceId", resource.getId(),
                        "endsAt", session.getEndsAt(), "commandSequence", commandSequence), null,
                AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.GAMING_SESSION_STARTED, "GAMING_SESSION", session.getId(),
                Map.of("identity", customer==null?"GUEST":customer.getId(), "resourceId", resource.getId(),
                        "locationId", locationId, "endsAt", session.getEndsAt(),
                        "commandSequence", commandSequence));
        return GamingSessionResponse.from(session, now);
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('GAMING_SESSION_EXTEND')")
    public GamingSessionResponse extend(UUID id, ExtendGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession reference=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Gaming session not found"));
        locations.requireResourceManagement(actor,reference.getResourceId(),Permission.GAMING_SESSION_EXTEND);
        if(reference.getCustomerId()!=null) users.findByIdForUpdate(reference.getCustomerId());
        resources.lockResource(reference.getResourceId());
        GamingSession session=locked(id);entityManager.refresh(session,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        version(session, request.version()); Instant previousEnd = session.getEndsAt();
        transitions.requireActive(session);
        if(session.getMoveTargetId()!=null || !session.getEndsAt().isAfter(clock.instant()))
            throw new ApplicationException(HttpStatus.CONFLICT,"Expired or moving sessions cannot be extended");
        Instant nextEnd=session.getEndsAt().plus(Duration.ofMinutes(request.minutes()));
        if(request.minutes()<=0 || (billing.purchasedMinutes(id)+request.minutes()>billing.policy().maximumMinutes()))
            throw new ApplicationException(HttpStatus.CONFLICT,"Session maximum duration would be exceeded");
        bookingAvailability.requireResourceReservationAvailableForUpdate(session.getResourceId(),session.getStartedAt(),nextEnd,session.getReservationId());
        billing.charge(session,request.minutes(),request.purchase());
        session.setEndsAt(nextEnd);
        session = sessions.saveAndFlush(session);
        long commandSequence = commands.write(session, StationCommandType.SESSION_EXTENDED);
        session = sessions.saveAndFlush(session); Instant now = clock.instant();
        audit.write("GAMING_SESSION_EXTENDED", "GAMING_SESSION", id,
                Map.of("endsAt", previousEnd), Map.of("endsAt", session.getEndsAt(),
                        "commandSequence", commandSequence),
                null, AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.GAMING_SESSION_EXTENDED, "GAMING_SESSION", id,
                Map.of("previousEndsAt", previousEnd, "endsAt", session.getEndsAt(),
                        "commandSequence", commandSequence));
        return GamingSessionResponse.from(session, now);
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")
    public GamingSessionResponse terminate(UUID id, TerminateGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession reference=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Session not found"));
        locations.requireResourceManagement(actor,reference.getResourceId(),Permission.GAMING_SESSION_TERMINATE);
        if(reference.getCustomerId()!=null) users.findByIdForUpdate(reference.getCustomerId());
        resources.lockResource(reference.getResourceId());
        GamingSession session=locked(id);entityManager.refresh(session,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        version(session, request.version()); transitions.requireActive(session); Instant now = clock.instant();
        session.setStatus(GamingSessionStatus.TERMINATED); session.setEndedAt(now);
        session.setTerminationReason(request.reason().trim()); session = sessions.saveAndFlush(session);
        long commandSequence = commands.write(session, StationCommandType.SESSION_TERMINATED);
        session = sessions.saveAndFlush(session);
        audit.write("GAMING_SESSION_TERMINATED", "GAMING_SESSION", id,
                Map.of("status", GamingSessionStatus.ACTIVE.name(), "endsAt", session.getEndsAt()),
                Map.of("status", session.getStatus().name(), "endedAt", now,
                        "commandSequence", commandSequence), request.reason(),
                AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.GAMING_SESSION_TERMINATED, "GAMING_SESSION", id,
                Map.of("endedAt", now, "reason", request.reason().trim(),
                        "commandSequence", commandSequence));
        return GamingSessionResponse.from(session, now);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public GamingSessionResponse get(UUID id) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession session = sessions.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Gaming session not found"));
        locations.requireResourceAccess(actor, session.getResourceId());
        return GamingSessionResponse.from(session, clock.instant());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<GamingSessionResponse> active() {
        AuthenticatedUser actor = currentUser.requireCurrentUser(); Instant now = clock.instant();
        Set<UUID> assigned=locations.assignedResources(actor);
        boolean all=actor.role()==Role.OWNER || actor.role()==Role.ADMIN;
        return sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE).stream()
                .filter(value -> all || assigned.contains(value.getResourceId()))
                .map(value -> GamingSessionResponse.from(value, now)).toList();
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    // Operational active-session snapshot, independent of the historical page.
    public List<GamingSessionVisitResponse> myVisits() {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER)
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Customer account is required");
        return sessions.customerVisits(actor.id(), true, List.of(actor.id()), clock.instant(),
                org.springframework.data.domain.PageRequest.of(0, 20));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<GamingSessionVisitResponse> customerVisits(UUID customerId) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        boolean all = actor.role() == Role.OWNER || actor.role() == Role.ADMIN;
        Set<UUID> assigned = locations.assignedResources(actor);
        if (!all && assigned.isEmpty()) return List.of();
        return sessions.customerVisits(customerId, all, all ? List.of(actor.id()) : assigned, clock.instant(),
                org.springframework.data.domain.PageRequest.of(0, 20));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> myVisitPage(int page,int size) {
        var actor=currentUser.requireCurrentUser();
        if(actor.role()!=Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Customer account is required");
        return com.game_manager.gm.common.dto.PageResponse.from(sessions.visitPage(actor.id(),true,List.of(actor.id()),clock.instant(),com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted())));
    }
    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> customerVisitPage(UUID customerId,int page,int size) {
        var actor=currentUser.requireCurrentUser(); boolean all=actor.role()==Role.OWNER||actor.role()==Role.ADMIN;
        var assigned=locations.assignedResources(actor);
        var pageable=com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted());
        if(!all&&assigned.isEmpty())return com.game_manager.gm.common.dto.PageResponse.from(org.springframework.data.domain.Page.empty(pageable));
        return com.game_manager.gm.common.dto.PageResponse.from(sessions.visitPage(customerId,all,all?List.of(actor.id()):assigned,clock.instant(),pageable));
    }

    public record MoveRequest(@jakarta.validation.constraints.NotNull UUID targetResourceId,@jakarta.validation.constraints.NotNull Long version) {}
    public record MoveCompletion(@jakarta.validation.constraints.NotNull Long version) {}
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_SESSION_EXTEND')")
    public GamingSessionResponse move(UUID id,MoveRequest request) {
        GamingSession session=lockForMove(id,request.targetResourceId());version(session,request.version());
        transitions.requireActive(session);
        if(session.getMoveTargetId()==null && !session.getEndsAt().isAfter(clock.instant()) || session.getResourceId().equals(request.targetResourceId()))
            throw new ApplicationException(HttpStatus.CONFLICT,"Session cannot be moved in its current state");
        PhysicalResource source=resources.lockGamingStation(session.getResourceId());
        PhysicalResource target=resources.lockGamingStation(request.targetResourceId());
        if(!source.getServiceId().equals(target.getServiceId()) || !session.getLocationId().equals(resources.locationId(target)))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Choose a station in the same category and location");
        stationReadiness.requireReadyForSession(target.getId());
        if(sessions.existsByResourceIdAndStatus(target.getId(),GamingSessionStatus.ACTIVE) || sessions.existsByMoveTargetIdAndStatus(target.getId(),GamingSessionStatus.ACTIVE))
            throw new ApplicationException(HttpStatus.CONFLICT,"Destination station is already occupied or reserved for a transfer");
        Instant now=clock.instant();
        bookingAvailability.requireResourceReservationAvailableForUpdate(target.getId(),now,session.getMoveRemainingSeconds()==null?session.getEndsAt():now.plusSeconds(session.getMoveRemainingSeconds()),null);
        boolean alreadyMoving=session.getMoveTargetId()!=null;
        session.setMoveTargetId(target.getId());
        if(!alreadyMoving) {session.setMoveRemainingSeconds(Math.max(1,(Duration.between(now,session.getEndsAt()).toMillis()+999)/1000));commands.write(session,StationCommandType.FORCE_LOCK);}sessions.saveAndFlush(session);
        audit.write("GAMING_TRANSFER_REQUESTED","GAMING_SESSION",id,null,Map.of("source",source.getId(),"target",target.getId(),"remainingSeconds",session.getMoveRemainingSeconds()),null,AuditVisibility.MANAGEMENT);
        return GamingSessionResponse.from(session,now);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_SESSION_EXTEND')")
    public GamingSessionResponse completeMove(UUID id,MoveCompletion request) {
        GamingSession reference=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Session not found"));
        if(reference.getMoveTargetId()==null) throw new ApplicationException(HttpStatus.CONFLICT,"No pending transfer");
        GamingSession session=lockForMove(id,reference.getMoveTargetId());version(session,request.version());transitions.requireActive(session);
        UUID source=session.getResourceId(),target=session.getMoveTargetId();
        if(target==null) throw new ApplicationException(HttpStatus.CONFLICT,"Transfer changed; refresh");
        var states=clientState.states(List.of(source));var state=states.get(source);
        if(state==null || !"LOCKED".equals(state.status()) || !id.equals(state.sessionId()) || state.lastLockAckAt()==null)
            throw new ApplicationException(HttpStatus.CONFLICT,"Wait for the source Client lock acknowledgement");
        PhysicalResource sourceResource=resources.lockGamingStation(source),targetResource=resources.lockGamingStation(target);
        if(!sourceResource.getServiceId().equals(targetResource.getServiceId()) || !session.getLocationId().equals(resources.locationId(targetResource)))
            throw new ApplicationException(HttpStatus.CONFLICT,"Destination category or location changed; review the transfer");
        stationReadiness.requireReadyForSession(target);
        if(sessions.existsByResourceIdAndStatus(target,GamingSessionStatus.ACTIVE)) throw new ApplicationException(HttpStatus.CONFLICT,"Destination occupied");
        Instant now=clock.instant(),end=now.plusSeconds(session.getMoveRemainingSeconds());
        bookingAvailability.requireResourceReservationAvailableForUpdate(target,now,end,null);
        session.setResourceId(target);session.setReservationId(null);session.setEndsAt(end);session.setMoveTargetId(null);session.setMoveRemainingSeconds(null);
        preparation.occupied(target,id);commands.write(session,StationCommandType.SESSION_STARTED);sessions.saveAndFlush(session);
        audit.write("GAMING_TRANSFER_COMPLETED","GAMING_SESSION",id,Map.of("resourceId",source),Map.of("resourceId",target,"endsAt",end),null,AuditVisibility.MANAGEMENT);
        return GamingSessionResponse.from(session,now);
    }
    private GamingSession lockForMove(UUID id,UUID target) {
        var actor=currentUser.requireCurrentUser();var ref=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Session not found"));
        locations.requireResourceManagement(actor,ref.getResourceId(),Permission.GAMING_SESSION_EXTEND);
        locations.requireResourceManagement(actor,target,Permission.GAMING_SESSION_EXTEND);
        if(ref.getCustomerId()!=null) users.findByIdForUpdate(ref.getCustomerId());
        java.util.stream.Stream.of(ref.getResourceId(),target).distinct().sorted().forEach(resources::lockResource);
        var session=locked(id);entityManager.refresh(session,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);return session;
    }

    private GamingSession locked(UUID id) { return sessions.findByIdForUpdate(id)
            .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Gaming session not found")); }
    private void version(GamingSession session, Long expected) { if (!session.getVersion().equals(expected))
        throw new ApplicationException(HttpStatus.CONFLICT, "Gaming session was changed; refresh and try again"); }
    private Reservation validateReservation(UUID id, UUID customerId, UUID resourceId, UUID locationId) {
        if (id == null) return null;
        Reservation value = reservations.findByIdForUpdate(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Reservation is not available"));
        if (!value.getCustomerId().equals(customerId) || !resourceId.equals(value.getResourceId())
                || !locationId.equals(value.getLocationId())
                || value.getStatus() == ReservationStatus.CANCELLED || value.getStatus() == ReservationStatus.REJECTED)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Reservation does not match this session");
        return value;
    }
}
