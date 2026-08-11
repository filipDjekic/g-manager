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
import com.game_manager.gm.reservation.dto.CalendarReservationResponse;
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
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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
    private static final Set<String> ALLOWED_SORTS =
            Set.of("startTime", "endTime", "status", "createdAt");

    private final ReservationRepository reservationRepository;
    private final UserRepository userRepository;
    private final CatalogService catalogService;
    private final WorkingHoursService workingHoursService;
    private final CurrentUserProvider currentUserProvider;
    private final GManagerProperties properties;
    private final PageRequestFactory pageRequestFactory;
    private final ReservationTransitionPolicy transitionPolicy;
    private final ReservationAvailabilityPolicy availabilityPolicy;
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
        Instant endTime = request.startTime().plus(service.getDurationMinutes(), ChronoUnit.MINUTES);
        workingHoursService.validateWithinWorkingHours(request.startTime(), endTime);
        User employee = selectEmployee(request.employeeId(), request.startTime(), endTime);

        Reservation reservation = new Reservation();
        reservation.setCustomerId(actor.id());
        reservation.setEmployeeId(employee.getId());
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
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public List<CalendarReservationResponse> calendar(UUID employeeId, LocalDate from, LocalDate to) {
        if (from == null || to == null || from.isAfter(to) || from.plusDays(92).isBefore(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST,
                    "Calendar range must contain between 1 and 93 days");
        }
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        UUID scopedEmployeeId;
        if (actor.role() == Role.EMPLOYEE) {
            scopedEmployeeId = actor.id();
        } else if (actor.role() == Role.ADMIN || actor.role() == Role.OWNER) {
            scopedEmployeeId = employeeId;
        } else {
            throw new ApplicationException(HttpStatus.FORBIDDEN,
                    "Reservation calendar is not permitted");
        }
        ZoneId zone = workingHoursService.getBusinessZone();
        List<Reservation> reservations = reservationRepository.findCalendarBetween(
                from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant(),
                scopedEmployeeId);
        Map<UUID, User> users = userRepository.findAllById(reservations.stream()
                .flatMap(value -> java.util.stream.Stream.of(value.getEmployeeId(), value.getCustomerId()))
                .collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        Map<UUID, CatalogReference> services = reservations.stream().map(Reservation::getServiceId).distinct()
                .collect(Collectors.toMap(Function.identity(), catalogService::getReference));
        return reservations.stream().map(value -> new CalendarReservationResponse(
                value.getId(), value.getEmployeeId(), users.get(value.getEmployeeId()).getName(),
                users.get(value.getCustomerId()).getName(), services.get(value.getServiceId()).name(),
                value.getStartTime(), value.getEndTime(), value.getStatus(), value.getVersion(),
                transitionPolicy.allowedActions(actor, value))).toList();
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
        List<ReservationStatus> actions = transitionPolicy.allowedActions(actor, reservation);
        boolean canSeeContact = RolePermissions.has(actor.role(), Permission.USER_LIST);
        List<ReservationHistoryResponse> history = auditHistoryReader
                .findStatusTransitions("RESERVATION", reservation.getId()).stream()
                .map(item -> new ReservationHistoryResponse(
                        item.fromStatus(), item.toStatus(), item.reason(), item.occurredAt()))
                .toList();
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
        transitionPolicy.requireTransition(actor, reservation, request.status(), request.reason());
        ReservationStatus previousStatus = reservation.getStatus();

        if (request.status() == ReservationStatus.CONFIRMED) {
            userRepository.findByIdForUpdate(reservation.getEmployeeId())
                    .orElseThrow(() -> new ApplicationException(
                            HttpStatus.NOT_FOUND, "Employee not found"));
            availabilityPolicy.requireAvailable(
                    reservation.getEmployeeId(), reservation.getStartTime(),
                    reservation.getEndTime(), reservation.getId());
        }

        reservation.setStatus(request.status());
        Reservation saved = reservationRepository.saveAndFlush(reservation);
        auditWriter.write("RESERVATION_STATUS_CHANGED", "RESERVATION", id,
                java.util.Map.of("status", previousStatus.name()),
                java.util.Map.of("status", saved.getStatus().name()), request.reason(),
                AuditVisibility.MANAGEMENT);
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

    private User selectEmployee(UUID requestedId, Instant start, Instant end) {
        if (requestedId != null) {
            User employee = userRepository.findByIdForUpdate(requestedId)
                    .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
            if (!employee.isActive() || employee.getRole() != Role.EMPLOYEE) {
                throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Selected user is not an active employee");
            }
            availabilityPolicy.requireAvailable(employee.getId(), start, end, null);
            return employee;
        }
        List<User> employees = userRepository.findActiveEmployeesForUpdate();
        if (employees.isEmpty()) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "No active employees are available for booking");
        }
        return employees.stream()
                .filter(employee -> availabilityPolicy.isAvailable(employee.getId(), start, end, null))
                .findFirst()
                .orElseThrow(() -> new ApplicationException(HttpStatus.CONFLICT,
                        "No employee is available at this time"));
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
    public Map<UUID, CustomerReservationSummary> summarizeCustomers(Set<UUID> customerIds) {
        if (customerIds.isEmpty()) return Map.of();
        return reservationRepository.summarizeCustomers(customerIds).stream()
                .collect(Collectors.toMap(CustomerReservationSummary::customerId, Function.identity()));
    }

    @Transactional(readOnly = true)
    public List<CustomerReservationHistory> customerHistory(UUID customerId, int limit) {
        List<Reservation> values = reservationRepository.customerHistory(customerId,
                org.springframework.data.domain.PageRequest.of(0, limit));
        Map<UUID, CatalogReference> services = catalogService.getReferences(values.stream()
                .map(Reservation::getServiceId).collect(Collectors.toSet()));
        return values.stream().map(value -> new CustomerReservationHistory(value.getId(),
                services.get(value.getServiceId()).name(), value.getStartTime(), value.getEndTime(),
                value.getStatus())).toList();
    }

    @Transactional(readOnly = true)
    public long countForEmployeeToday(
            UUID employeeId, ReservationStatus status, Instant from, Instant to) {
        return reservationRepository.countForEmployeeAndStatusBetween(
                employeeId, status, from, to);
    }
}
