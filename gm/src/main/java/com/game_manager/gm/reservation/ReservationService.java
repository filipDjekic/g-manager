package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogService;
import com.game_manager.gm.catalog.CatalogReference;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.reservation.dto.ChangeReservationStatusRequest;
import com.game_manager.gm.reservation.dto.CreateReservationRequest;
import com.game_manager.gm.reservation.dto.ReservationResponse;
import com.game_manager.gm.reservation.dto.ReservationDetailResponse;
import com.game_manager.gm.reservation.dto.ReservationHistoryResponse;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.audit.AuditHistoryReader;
import com.game_manager.gm.events.DomainEventType;
import com.game_manager.gm.events.OutboxWriter;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.Instant;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReservationService {
    private static final List<ReservationStatus> NON_BLOCKING =
            List.of(ReservationStatus.CANCELLED, ReservationStatus.REJECTED);
    private static final Set<String> ALLOWED_SORTS =
            Set.of("startTime", "endTime", "status", "createdAt");

    private final ReservationRepository reservationRepository;
    private final UserRepository userRepository;
    private final CatalogService catalogService;
    private final WorkingHoursService workingHoursService;
    private final CurrentUserProvider currentUserProvider;
    private final GManagerProperties properties;
    private final PageRequestFactory pageRequestFactory;
    private final ReservationAuthorizationPolicy authorizationPolicy;
    private final AuditWriter auditWriter;
    private final AuditHistoryReader auditHistoryReader;
    private final OutboxWriter outboxWriter;
    private final Clock clock;

    @Transactional
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public ReservationResponse create(CreateReservationRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER) {
            throw new ApplicationException(
                    HttpStatus.FORBIDDEN, "Only customers can create reservations");
        }
        if (!request.startTime().isAfter(clock.instant())) {
            throw new ApplicationException(
                    HttpStatus.BAD_REQUEST, "Reservation must be in the future");
        }

        CatalogItem service = catalogService.getActiveById(request.serviceId());
        if (service.getType() != ItemType.SERVICE) {
            throw new ApplicationException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Catalog item is not a service");
        }
        User employee = userRepository.findById(request.employeeId())
                .orElseThrow(() -> new ApplicationException(
                        HttpStatus.NOT_FOUND, "Employee not found"));
        if (!employee.isActive() || employee.getRole() != Role.EMPLOYEE) {
            throw new ApplicationException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Selected user is not an active employee");
        }

        Instant endTime = request.startTime().plus(service.getDurationMinutes(), ChronoUnit.MINUTES);
        workingHoursService.validateWithinWorkingHours(request.startTime(), endTime);

        userRepository.findByIdForUpdate(request.employeeId())
                .orElseThrow(() -> new ApplicationException(
                        HttpStatus.NOT_FOUND, "Employee not found"));
        ensureAvailable(request.employeeId(), request.startTime(), endTime, null);

        Reservation reservation = new Reservation();
        reservation.setCustomerId(actor.id());
        reservation.setEmployeeId(request.employeeId());
        reservation.setServiceId(request.serviceId());
        reservation.setStartTime(request.startTime());
        reservation.setEndTime(endTime);
        reservation.setStatus(ReservationStatus.PENDING);
        reservation.setNote(normalizeNote(request.note()));
        Reservation saved = reservationRepository.saveAndFlush(reservation);
        outboxWriter.write(DomainEventType.RESERVATION_CREATED, "RESERVATION", saved.getId(),
                java.util.Map.of("status", saved.getStatus().name()));
        return ReservationResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    public PageResponse<ReservationResponse> listMine(
            ReservationStatus status,
            LocalDate from,
            LocalDate to,
            int page,
            int size,
            String sort,
            String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Customer access is required");
        }
        return listInternal(actor.id(), null, status, from, to, page, size, sort, direction);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<ReservationResponse> listAll(
            UUID employeeId,
            ReservationStatus status,
            LocalDate from,
            LocalDate to,
            int page,
            int size,
            String sort,
            String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() == Role.EMPLOYEE) {
            employeeId = actor.id();
        } else if (actor.role() != Role.ADMIN && actor.role() != Role.OWNER) {
            throw new ApplicationException(
                    HttpStatus.FORBIDDEN, "Reservation management is not permitted");
        }
        return listInternal(null, employeeId, status, from, to, page, size, sort, direction);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN') or hasAuthority('RESERVATION_READ_ALL')")
    public ReservationDetailResponse getDetail(UUID id) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Reservation not found"));
        boolean management = actor.role() == Role.ADMIN || actor.role() == Role.OWNER;
        boolean visible = management
                || actor.role() == Role.EMPLOYEE && actor.id().equals(reservation.getEmployeeId())
                || actor.role() == Role.CUSTOMER && actor.id().equals(reservation.getCustomerId());
        if (!visible) {
            throw new ApplicationException(HttpStatus.NOT_FOUND, "Reservation not found");
        }

        User customer = userRepository.findById(reservation.getCustomerId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Customer not found"));
        User employee = userRepository.findById(reservation.getEmployeeId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
        CatalogReference service = catalogService.getReference(reservation.getServiceId());
        List<ReservationStatus> actions = allowedActions(actor, reservation);
        boolean canSeeContact = RolePermissions.has(actor.role(), Permission.USER_LIST);
        List<ReservationHistoryResponse> history = RolePermissions.has(actor.role(), Permission.AUDIT_READ)
                ? auditHistoryReader.find("RESERVATION", reservation.getId()).stream()
                    .map(item -> new ReservationHistoryResponse(item.action(), item.occurredAt())).toList()
                : List.of();
        return new ReservationDetailResponse(
                reservation.getId(), customer.getName(), canSeeContact ? customer.getEmail() : null,
                employee.getName(), service.name(), service.durationMinutes(),
                reservation.getStartTime(), reservation.getEndTime(), reservation.getStatus(),
                reservation.getNote(), reservation.getCreatedAt(), reservation.getUpdatedAt(),
                reservation.getVersion(), actions, history);
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESERVATION_CHANGE_STATUS')")
    public ReservationResponse changeStatus(
            UUID id, ChangeReservationStatusRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(
                        HttpStatus.NOT_FOUND, "Reservation not found"));
        requireVersion(reservation, request.version());
        authorizationPolicy.requireTransition(actor, reservation, request.status());
        ReservationStatus previousStatus = reservation.getStatus();
        validateTransition(reservation, request.status(), actor);

        if (request.status() == ReservationStatus.CONFIRMED) {
            userRepository.findByIdForUpdate(reservation.getEmployeeId())
                    .orElseThrow(() -> new ApplicationException(
                            HttpStatus.NOT_FOUND, "Employee not found"));
            ensureAvailable(
                    reservation.getEmployeeId(), reservation.getStartTime(),
                    reservation.getEndTime(), reservation.getId());
            if (!reservation.getStartTime().isAfter(clock.instant())) {
                throw new ApplicationException(
                        HttpStatus.CONFLICT, "Past reservations cannot be confirmed");
            }
        }
        if (request.status() == ReservationStatus.COMPLETED
                && clock.instant().isBefore(reservation.getEndTime())) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Reservation has not ended yet");
        }
        if (request.status() == ReservationStatus.CANCELLED
                && actor.role() == Role.CUSTOMER
                && reservation.getStatus() == ReservationStatus.CONFIRMED
                && !clock.instant().isBefore(
                        reservation.getStartTime().minus(
                                properties.reservations().cancellationCutoffMinutes(),
                                ChronoUnit.MINUTES))) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "It is too late to cancel this reservation");
        }

        reservation.setStatus(request.status());
        if (request.note() != null) {
            reservation.setNote(normalizeNote(request.note()));
        }
        Reservation saved = reservationRepository.saveAndFlush(reservation);
        auditWriter.write("RESERVATION_STATUS_CHANGED", "RESERVATION", id,
                java.util.Map.of("status", previousStatus.name()),
                java.util.Map.of("status", saved.getStatus().name()), null, AuditVisibility.MANAGEMENT);
        outboxWriter.write(DomainEventType.RESERVATION_STATUS_CHANGED, "RESERVATION", saved.getId(),
                java.util.Map.of("previousStatus", previousStatus.name(),
                        "status", saved.getStatus().name()));
        return ReservationResponse.from(saved);
    }

    private PageResponse<ReservationResponse> listInternal(
            UUID customerId,
            UUID employeeId,
            ReservationStatus status,
            LocalDate from,
            LocalDate to,
            int page,
            int size,
            String sort,
            String direction) {
        validateDateRange(from, to);
        ZoneId zone = workingHoursService.getBusinessZone();
        Instant fromInstant = from == null ? null : from.atStartOfDay(zone).toInstant();
        Instant toInstant = to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant();

        Specification<Reservation> specification =
                (root, query, builder) -> builder.conjunction();
        specification = specification
                .and(ReservationSpecifications.hasCustomer(customerId))
                .and(ReservationSpecifications.hasEmployee(employeeId))
                .and(ReservationSpecifications.hasStatus(status))
                .and(ReservationSpecifications.startsFrom(fromInstant))
                .and(ReservationSpecifications.startsBefore(toInstant));
        Page<ReservationResponse> result = reservationRepository
                .findAll(
                        specification,
                        pageRequestFactory.create(page, size, sort, direction, ALLOWED_SORTS))
                .map(ReservationResponse::from);
        return PageResponse.from(result);
    }

    private void ensureAvailable(
            UUID employeeId, Instant start, Instant end, UUID excludeId) {
        if (!reservationRepository
                .findConflicting(employeeId, start, end, NON_BLOCKING, excludeId)
                .isEmpty()) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Employee is unavailable at this time");
        }
    }

    private static void validateTransition(
            Reservation reservation, ReservationStatus target, AuthenticatedUser actor) {
        ReservationStatus current = reservation.getStatus();
        boolean valid = switch (current) {
            case PENDING -> target == ReservationStatus.CONFIRMED
                    || target == ReservationStatus.REJECTED
                    || target == ReservationStatus.CANCELLED;
            case CONFIRMED -> target == ReservationStatus.COMPLETED
                    || target == ReservationStatus.CANCELLED;
            case REJECTED, CANCELLED, COMPLETED -> false;
        };
        if (!valid) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Invalid reservation status transition");
        }
    }

    private List<ReservationStatus> allowedActions(
            AuthenticatedUser actor, Reservation reservation) {
        return switch (reservation.getStatus()) {
            case PENDING -> List.of(ReservationStatus.CONFIRMED, ReservationStatus.REJECTED,
                            ReservationStatus.CANCELLED).stream()
                    .filter(target -> authorizationPolicy.canTransition(actor, reservation, target)).toList();
            case CONFIRMED -> List.of(ReservationStatus.COMPLETED, ReservationStatus.CANCELLED).stream()
                    .filter(target -> authorizationPolicy.canTransition(actor, reservation, target))
                    .filter(target -> target != ReservationStatus.COMPLETED
                            || !clock.instant().isBefore(reservation.getEndTime()))
                    .filter(target -> target != ReservationStatus.CANCELLED
                            || actor.role() != Role.CUSTOMER
                            || clock.instant().isBefore(reservation.getStartTime().minus(
                                    properties.reservations().cancellationCutoffMinutes(), ChronoUnit.MINUTES)))
                    .toList();
            case REJECTED, CANCELLED, COMPLETED -> List.of();
        };
    }

    private static void validateDateRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is not valid");
        }
    }

    private static void requireVersion(Reservation reservation, Long expectedVersion) {
        if (!reservation.getVersion().equals(expectedVersion)) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Reservation was changed; refresh and try again");
        }
    }

    private static String normalizeNote(String note) {
        return note == null || note.isBlank() ? null : note.trim();
    }

    @Transactional(readOnly = true)
    public List<ReservationStatusTotal> countByStatusBetween(Instant from, Instant to) {
        return reservationRepository.countByStatusBetween(from, to);
    }

    @Transactional(readOnly = true)
    public List<ReservationAnalyticsRow> analyticsBetween(Instant from, Instant to, UUID employeeId) {
        return reservationRepository.analyticsBetween(from, to, employeeId);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<ReservationNotificationContext> notificationContext(UUID id) {
        return reservationRepository.findById(id).map(value -> new ReservationNotificationContext(
                value.getCustomerId(), value.getEmployeeId(), value.getStatus()));
    }

    @Transactional(readOnly = true)
    public long countForEmployeeToday(
            UUID employeeId, ReservationStatus status, Instant from, Instant to) {
        return reservationRepository.countForEmployeeAndStatusBetween(
                employeeId, status, from, to);
    }
}
