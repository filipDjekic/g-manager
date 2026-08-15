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
    private final GamingSessionRepository sessions;
    private final UserRepository users;
    private final ResourceManagementService resources;
    private final StationReadinessService stationReadiness;
    private final ReservationRepository reservations;
    private final GamingSessionTransitionPolicy transitions;
    private final GamingSessionLocationPolicy locations;
    private final CurrentUserProvider currentUser;
    private final Clock clock;
    private final AuditWriter audit;
    private final OutboxWriter outbox;
    private final StationCommandWriter commands;

    @Transactional
    @PreAuthorize("hasAuthority('GAMING_SESSION_START')")
    public GamingSessionResponse start(StartGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        Duration duration = transitions.startDuration(request.durationMinutes());

        // Every start locks customer first and resource second. This order is invariant.
        User customer = users.findByIdForUpdate(request.customerId())
                .filter(value -> value.getRole() == Role.CUSTOMER && value.isActive() && !value.isDeleted())
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Customer is not available for a gaming session"));
        PhysicalResource resource = resources.lockGamingStation(request.resourceId());
        stationReadiness.requireReadyForSession(resource.getId());
        UUID locationId = resources.locationId(resource);
        locations.requireAccess(actor, locationId);
        if (sessions.existsByCustomerIdAndStatus(customer.getId(), GamingSessionStatus.ACTIVE))
            throw new ApplicationException(HttpStatus.CONFLICT, "Customer already has an active gaming session");
        if (sessions.existsByResourceIdAndStatus(resource.getId(), GamingSessionStatus.ACTIVE))
            throw new ApplicationException(HttpStatus.CONFLICT, "Station already has an active gaming session");
        Reservation reservation = validateReservation(request.reservationId(), customer.getId(),
                resource.getId(), locationId);
        Instant now = clock.instant();
        GamingSession session = new GamingSession();
        session.setCustomerId(customer.getId()); session.setResourceId(resource.getId());
        session.setLocationId(locationId); session.setReservationId(reservation == null ? null : reservation.getId());
        session.setStartedBy(actor.id()); session.setStartedAt(now); session.setEndsAt(now.plus(duration));
        session.setStatus(GamingSessionStatus.ACTIVE); session = sessions.saveAndFlush(session);
        long commandSequence = commands.write(session, StationCommandType.SESSION_STARTED);
        session = sessions.saveAndFlush(session);
        audit.write("GAMING_SESSION_STARTED", "GAMING_SESSION", session.getId(), null,
                Map.of("customerId", customer.getId(), "resourceId", resource.getId(),
                        "endsAt", session.getEndsAt(), "commandSequence", commandSequence), null,
                AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.GAMING_SESSION_STARTED, "GAMING_SESSION", session.getId(),
                Map.of("customerId", customer.getId(), "resourceId", resource.getId(),
                        "locationId", locationId, "endsAt", session.getEndsAt(),
                        "commandSequence", commandSequence));
        return GamingSessionResponse.from(session, now);
    }

    @Transactional
    @PreAuthorize("hasAuthority('GAMING_SESSION_EXTEND')")
    public GamingSessionResponse extend(UUID id, ExtendGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession session = locked(id); locations.requireAccess(actor, session.getLocationId());
        version(session, request.version()); Instant previousEnd = session.getEndsAt();
        session.setEndsAt(transitions.extendedEnd(session, request.minutes()));
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

    @Transactional
    @PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")
    public GamingSessionResponse terminate(UUID id, TerminateGamingSessionRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession session = locked(id); locations.requireAccess(actor, session.getLocationId());
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
        locations.requireAccess(actor, session.getLocationId());
        return GamingSessionResponse.from(session, clock.instant());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<GamingSessionResponse> active() {
        AuthenticatedUser actor = currentUser.requireCurrentUser(); Instant now = clock.instant();
        return sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE).stream()
                .filter(value -> locations.canAccess(actor, value.getLocationId()))
                .map(value -> GamingSessionResponse.from(value, now)).toList();
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
