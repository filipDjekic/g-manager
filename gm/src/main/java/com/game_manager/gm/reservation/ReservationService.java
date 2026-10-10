package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogService;
import com.game_manager.gm.catalog.CatalogReference;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.reservation.dto.ChangeReservationStatusRequest;
import com.game_manager.gm.reservation.dto.CreateReservationRequest;
import com.game_manager.gm.reservation.dto.ReservationResponse;
import com.game_manager.gm.reservation.dto.ReservationDetailResponse;
import com.game_manager.gm.reservation.dto.ReservationHistoryResponse;
import com.game_manager.gm.reservation.dto.CalendarReservationResponse;
import com.game_manager.gm.reservation.dto.ReservationSummaryResponse;
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
import com.game_manager.gm.resource.PhysicalResource;
import com.game_manager.gm.resource.ResourceManagementService;
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
        private final PageRequestFactory pageRequestFactory;
    private final ReservationTransitionPolicy transitionPolicy;
    private final ReservationAvailabilityPolicy availabilityPolicy;
    private final AuditWriter auditWriter;
    private final AuditHistoryReader auditHistoryReader;
    private final OutboxWriter outboxWriter;
    private final Clock clock;
    private final ResourceManagementService resourceService;
    private final com.game_manager.gm.resource.ResourceAccessService resourceAccess;

    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public ReservationResponse create(CreateReservationRequest request) {
        return createForCustomer(resolveBookingCustomer(request.customerId()), request, null);
    }

    UUID resolveBookingCustomer(UUID requestedCustomerId) {
        AuthenticatedUser actor=currentUserProvider.requireCurrentUser();
        UUID customerId;
        if (actor.role()==Role.CUSTOMER) {
            if (requestedCustomerId!=null && !actor.id().equals(requestedCustomerId))
                throw new ApplicationException(HttpStatus.FORBIDDEN,"Customer access is required");
            customerId=actor.id();
        } else {
            if (requestedCustomerId==null) throw new ApplicationException(HttpStatus.BAD_REQUEST,"Customer is required");
            customerId=requestedCustomerId;
        }
        userRepository.findById(customerId)
                .filter(value -> value.getRole()==Role.CUSTOMER && value.isActive() && !value.isDeleted())
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Customer is not available for booking"));
        return customerId;
    }

    ReservationResponse createForCustomer(
            UUID customerId, CreateReservationRequest request, UUID recurrenceSeriesId) {
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
        AuthenticatedUser actor=currentUserProvider.requireCurrentUser();
        Set<UUID> allowed=actor.role()==Role.EMPLOYEE ? resourceAccess.assignedResources(actor) : null;
        if(actor.role()==Role.EMPLOYEE) resourceAccess.requireManageForUpdate(actor,
                request.resourceId()==null ? allowed : java.util.Collections.singletonList(request.resourceId()),Permission.RESERVATION_CREATE);
        User employee = selectEmployee(request.employeeId(), request.startTime(), endTime);
        PhysicalResource resource = resourceService.selectForBooking(request.serviceId(), request.resourceId(),
                request.locationId(), request.startTime(), endTime,allowed);
        if (actor.role()!=Role.CUSTOMER) resourceAccess.requireManageForUpdate(actor,
                java.util.Collections.singletonList(resource==null ? null : resource.getId()),Permission.RESERVATION_CREATE);
        if(resource==null && request.locationId()!=null) resourceService.requireActiveLocation(request.locationId());
        workingHoursService.validateWithinWorkingHours(resource == null ? request.locationId() : resourceService.locationId(resource),
                request.startTime(), endTime);

        Reservation reservation = new Reservation();
        reservation.setCustomerId(customerId);
        reservation.setEmployeeId(employee.getId());
        reservation.setServiceId(request.serviceId());
        if (resource != null) {
            reservation.setResourceId(resource.getId());
            reservation.setLocationId(resourceService.locationId(resource));
        }
        if(resource==null) reservation.setLocationId(request.locationId());
        reservation.setRecurrenceSeriesId(recurrenceSeriesId);
        reservation.setStartTime(request.startTime());
        reservation.setEndTime(endTime);
        reservation.setStatus(ReservationStatus.PENDING);
        reservation.setNote(normalizeNote(request.note()));
        Reservation saved = reservationRepository.saveAndFlush(reservation);
        outboxWriter.write(DomainEventType.RESERVATION_CREATED, "RESERVATION", saved.getId(),
                java.util.Map.of("status", saved.getStatus().name()));
        return response(saved);
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
        return listAll(employeeId,status,from,to,page,size,sort,direction,ReservationScope.ALL,null,null,null);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<ReservationResponse> listAll(UUID employeeId, ReservationStatus status, LocalDate from,
            LocalDate to,int page,int size,String sort,String direction,ReservationScope scope,
            UUID resourceId,UUID locationId,UUID customerId) {
        return listInternal(customerId,employeeId,status,from,to,page,size,sort,direction,scope,resourceId,locationId);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public PageResponse<ReservationResponse> listAll(UUID employeeId, ReservationStatus status, LocalDate from,
            LocalDate to, int page, int size, String sort, String direction, ReservationScope scope,
            UUID resourceId, UUID locationId, UUID customerId, String search) {
        return listInternal(customerId, employeeId, status, from, to, page, size, sort, direction,
                scope, resourceId, locationId, search);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public ReservationSummaryResponse summary(ReservationScope scope, UUID resourceId, UUID locationId,
            UUID employeeId, UUID customerId, LocalDate from, LocalDate to, String search) {
        validateDateRange(from, to);
        ZoneId zone = workingHoursService.getBusinessZone();
        Instant now = clock.instant();
        LocalDate today = now.atZone(zone).toLocalDate();
        LocalDate customersFrom = from != null ? from : to != null ? to.minusDays(6) : today;
        LocalDate customersTo = to != null ? to : customersFrom.plusDays(6);
        Specification<Reservation> visible = scopeFilter(scope, resourceId, locationId)
                .and(ReservationSpecifications.hasEmployee(employeeId))
                .and(ReservationSpecifications.hasCustomer(customerId)).and(textFilter(search));
        Specification<Reservation> todayFilter = visible
                .and(ReservationSpecifications.startsFrom(today.atStartOfDay(zone).toInstant()))
                .and(ReservationSpecifications.startsBefore(today.plusDays(1).atStartOfDay(zone).toInstant()));
        Specification<Reservation> upcoming = visible.and(ReservationSpecifications.startsFrom(now))
                .and(ReservationSpecifications.startsBefore(today.plusDays(7).atStartOfDay(zone).toInstant()))
                .and((root, query, builder) -> root.get("status").in(ReservationStatus.PENDING, ReservationStatus.CONFIRMED));
        Specification<Reservation> customerPeriod = visible
                .and(ReservationSpecifications.startsFrom(customersFrom.atStartOfDay(zone).toInstant()))
                .and(ReservationSpecifications.startsBefore(customersTo.plusDays(1).atStartOfDay(zone).toInstant()));
        return new ReservationSummaryResponse(reservationRepository.count(todayFilter),
                reservationRepository.count(upcoming), reservationRepository.countDistinctCustomers(customerPeriod),
                reservationRepository.count(todayFilter.and(ReservationSpecifications.hasStatus(ReservationStatus.CANCELLED))),
                today, today.plusDays(6), customersFrom, customersTo, zone.getId());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public List<CalendarReservationResponse> calendar(UUID employeeId, LocalDate from, LocalDate to) {
        if (from == null || to == null || from.isAfter(to) || from.plusDays(92).isBefore(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST,
                    "Calendar range must contain between 1 and 93 days");
        }
        return calendar(employeeId,from,to,ReservationScope.ALL,null,null,null,null);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public List<CalendarReservationResponse> calendar(UUID employeeId,LocalDate from,LocalDate to,
            ReservationScope scope,UUID resourceId,UUID locationId,UUID customerId,ReservationStatus status) {
        if(from==null||to==null||from.isAfter(to)||from.plusDays(92).isBefore(to))
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Calendar range must contain between 1 and 93 days");
        ZoneId zone=workingHoursService.getBusinessZone();
        Specification<Reservation> filter=scopeFilter(scope,resourceId,locationId)
                .and(ReservationSpecifications.hasEmployee(employeeId)).and(ReservationSpecifications.hasCustomer(customerId))
                .and(ReservationSpecifications.hasStatus(status))
                .and(ReservationSpecifications.startsFrom(from.atStartOfDay(zone).toInstant()))
                .and(ReservationSpecifications.startsBefore(to.plusDays(1).atStartOfDay(zone).toInstant()));
        List<Reservation> values=reservationRepository.findAll(filter,org.springframework.data.domain.Sort.by("startTime"));
        return responses(values).values().stream().sorted(java.util.Comparator.comparing(ReservationResponse::startTime))
                .map(value -> new CalendarReservationResponse(value.id(),value.employeeId(),value.employeeName(),
                        value.customerName(),value.serviceName(),value.startTime(),value.endTime(),value.status(),
                        value.version(),value.allowedActions(),value.resourceId(),value.resourceName(),value.resourceCode(),
                        value.locationName(),value.canManage(),value.readOnly())).toList();
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN') or hasAuthority('RESERVATION_READ_ALL')")
    public ReservationDetailResponse getDetail(UUID id) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Reservation not found"));
        boolean management = actor.role() == Role.ADMIN || actor.role() == Role.OWNER;
        boolean visible = management
                || actor.role() == Role.EMPLOYEE
                || actor.role() == Role.CUSTOMER && actor.id().equals(reservation.getCustomerId());
        if (!visible) {
            throw new ApplicationException(HttpStatus.NOT_FOUND, "Reservation not found");
        }

        User customer = userRepository.findById(reservation.getCustomerId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Customer not found"));
        User employee = userRepository.findById(reservation.getEmployeeId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
        CatalogReference service = catalogService.getReferences(Set.of(reservation.getServiceId())).get(reservation.getServiceId());
        if (service == null) throw new ApplicationException(HttpStatus.NOT_FOUND,"Catalog item not found");
        boolean canManage=resourceAccess.canManage(actor,reservation.getResourceId());
        boolean readOnly=actor.role()==Role.EMPLOYEE && !canManage;
        List<ReservationStatus> actions = transitionPolicy.allowedActions(actor, reservation,
                resourceService.requiresResource(reservation.getServiceId()),canManage);
        boolean canSeeContact = RolePermissions.has(actor.role(), Permission.USER_LIST);
        List<ReservationHistoryResponse> history = auditHistoryReader
                .findStatusTransitions("RESERVATION", reservation.getId()).stream()
                .map(item -> new ReservationHistoryResponse(
                        item.fromStatus(), item.toStatus(), readOnly ? null : item.reason(), item.occurredAt()))
                .toList();
        ReservationResponse enriched = response(reservation);
        return new ReservationDetailResponse(
                reservation.getId(), readOnly ? "Klijent" : customer.getName(), canSeeContact ? customer.getEmail() : null,
                employee.getName(), service.name(), service.durationMinutes(),
                reservation.getStartTime(), reservation.getEndTime(), reservation.getStatus(),
                readOnly ? null : reservation.getNote(), reservation.getCreatedAt(), reservation.getUpdatedAt(),
                reservation.getVersion(), actions, history, reservation.getServiceId(), reservation.getLocationId(),
                enriched.locationName(), reservation.getResourceId(), enriched.resourceCode(),
                enriched.resourceName(), resourceService.requiresResource(reservation.getServiceId()),
                transitionPolicy.canAssignResource(actor,reservation),canManage,readOnly,canEdit(actor,reservation,canManage));
    }

    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('RESERVATION_CHANGE_STATUS')")
    public ReservationResponse changeStatus(
            UUID id, ChangeReservationStatusRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(
                        HttpStatus.NOT_FOUND, "Reservation not found"));
        if(actor.role()!=Role.CUSTOMER) resourceAccess.requireManageForUpdate(actor,
                java.util.Collections.singletonList(reservation.getResourceId()),Permission.RESERVATION_CHANGE_STATUS);
        requireVersion(reservation, request.version());
        transitionPolicy.requireTransition(actor, reservation, request.status(), request.reason(),
                resourceService.requiresResource(reservation.getServiceId()),resourceAccess.canManage(actor,reservation.getResourceId()));
        ReservationStatus previousStatus = reservation.getStatus();

        if (request.status() == ReservationStatus.CONFIRMED) {
            userRepository.findByIdForUpdate(reservation.getEmployeeId())
                    .orElseThrow(() -> new ApplicationException(
                            HttpStatus.NOT_FOUND, "Employee not found"));
            availabilityPolicy.requireAvailableForUpdate(
                    reservation.getEmployeeId(), reservation.getStartTime(),
                    reservation.getEndTime(), reservation.getId());
            if (reservation.getResourceId() != null) {
                resourceService.lockBookable(reservation.getResourceId(), reservation.getServiceId());
                availabilityPolicy.requireResourceAvailableForUpdate(reservation.getResourceId(),
                        reservation.getStartTime(), reservation.getEndTime(), reservation.getId());
            }
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
        return response(saved);
    }

    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('RESERVATION_CHANGE_STATUS')")
    public ReservationResponse assignResource(UUID id,
            com.game_manager.gm.reservation.dto.AssignReservationResourceRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Reservation not found"));
        resourceAccess.requireManageForUpdate(actor,java.util.Arrays.asList(reservation.getResourceId(),request.resourceId()),Permission.RESERVATION_CHANGE_STATUS);
        requireVersion(reservation,request.version());
        transitionPolicy.requireResourceAssignment(actor,reservation);
        userRepository.findByIdForUpdate(reservation.getEmployeeId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Employee not found"));
        PhysicalResource resource = resourceService.lockBookable(request.resourceId(),reservation.getServiceId());
        UUID locationId = resourceService.locationId(resource);
        workingHoursService.validateWithinWorkingHours(locationId,reservation.getStartTime(),reservation.getEndTime());
        availabilityPolicy.requireResourceAvailableForUpdate(resource.getId(),reservation.getStartTime(),
                reservation.getEndTime(),reservation.getId());
        reservation.setResourceId(resource.getId());
        reservation.setLocationId(locationId);
        Reservation saved = reservationRepository.saveAndFlush(reservation);
        auditWriter.write("RESERVATION_RESOURCE_ASSIGNED","RESERVATION",id,Map.of("resourceAssigned",false),
                Map.of("resourceId",resource.getId(),"locationId",locationId),null,AuditVisibility.MANAGEMENT);
        return response(saved);
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('RESERVATION_CHANGE_STATUS')")
    public ReservationResponse update(UUID id,com.game_manager.gm.reservation.dto.UpdateReservationRequest request) {
        AuthenticatedUser actor=currentUserProvider.requireCurrentUser();
        Reservation value=reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Reservation not found"));
        UUID target=request.resourceId()==null ? value.getResourceId() : request.resourceId();
        resourceAccess.requireManageForUpdate(actor,java.util.Arrays.asList(value.getResourceId(),target),Permission.RESERVATION_CHANGE_STATUS);
        requireVersion(value,request.version());
        if(!canEdit(actor,value,true)) throw new ApplicationException(HttpStatus.CONFLICT,"Only upcoming active reservations can be edited");
        Instant start=request.startTime()==null ? value.getStartTime() : request.startTime();
        if(!start.isAfter(clock.instant())) throw new ApplicationException(HttpStatus.BAD_REQUEST,"Reservation must be in the future");
        Instant end=start.plus(java.time.Duration.between(value.getStartTime(),value.getEndTime()));
        if(target==null && resourceService.requiresResource(value.getServiceId()))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Assign a compatible physical resource before editing");
        userRepository.findByIdForUpdate(value.getEmployeeId())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Employee not found"));
        availabilityPolicy.requireAvailableForUpdate(value.getEmployeeId(),start,end,id);
        PhysicalResource selected=null;
        Set<UUID> locks=new java.util.TreeSet<>();
        if(value.getResourceId()!=null) locks.add(value.getResourceId());
        if(target!=null) locks.add(target);
        for(UUID resourceId:locks){
            PhysicalResource locked=resourceId.equals(target)?resourceService.lockBookable(resourceId,value.getServiceId()):resourceService.lockResource(resourceId);
            if(resourceId.equals(target)) selected=locked;
        }
        // Resource mutexes also serialize this check with session start.
        if(reservationRepository.activeSessionCount(id.toString())>0)
            throw new ApplicationException(HttpStatus.CONFLICT,"Reservation has an active gaming session");
        UUID location=selected==null ? value.getLocationId() : resourceService.locationId(selected);
        workingHoursService.validateWithinWorkingHours(location,start,end);
        if(target!=null) availabilityPolicy.requireResourceAvailableForUpdate(target,start,end,id);
        Map<String,Object> before=new java.util.LinkedHashMap<>();
        before.put("startTime",value.getStartTime());before.put("endTime",value.getEndTime());before.put("resourceId",value.getResourceId());
        value.setStartTime(start);value.setEndTime(end);value.setResourceId(target);value.setLocationId(location);
        if(request.note()!=null) value.setNote(normalizeNote(request.note()));
        Reservation saved=reservationRepository.saveAndFlush(value);
        Map<String,Object> after=new java.util.LinkedHashMap<>();
        after.put("startTime",start);after.put("endTime",end);after.put("resourceId",target);
        auditWriter.write("RESERVATION_UPDATED","RESERVATION",id,before,after,null,AuditVisibility.MANAGEMENT);
        return response(saved);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public com.game_manager.gm.resource.dto.BookingOptionsResponse resourceOptions(UUID id,Instant startTime) {
        var actor=currentUserProvider.requireCurrentUser();
        Reservation value=reservationRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Reservation not found"));
        resourceAccess.requireManage(actor,value.getResourceId(),Permission.RESERVATION_CHANGE_STATUS);
        Instant start=startTime==null ? value.getStartTime() : startTime;
        Instant end=start.plus(java.time.Duration.between(value.getStartTime(),value.getEndTime()));
        return resourceService.bookingOptions(value.getServiceId(),null,start,end,
                resourceAccess.allResources(actor)?null:resourceAccess.assignedResources(actor),id);
    }


    private boolean canEdit(AuthenticatedUser actor,Reservation value,boolean canManage) {
        return actor.role()!=Role.CUSTOMER && canManage && value.getStartTime().isAfter(clock.instant())
                && (value.getStatus()==ReservationStatus.PENDING || value.getStatus()==ReservationStatus.CONFIRMED);
    }

    private ReservationResponse response(Reservation value) {
        return responses(List.of(value)).get(value.getId());
    }

    private Map<UUID,ReservationResponse> responses(List<Reservation> values) {
        var actor=currentUserProvider.requireCurrentUser();
        Set<UUID> assigned=resourceAccess.assignedResources(actor);
        var resources=resourceService.resourceReferences(values.stream().map(Reservation::getResourceId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        var locations=resourceService.locationNames(values.stream().map(Reservation::getLocationId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        var services=catalogService.getReferences(values.stream().map(Reservation::getServiceId).collect(Collectors.toSet()));
        var requirements=resourceService.resourceRequirements(values.stream().map(Reservation::getServiceId).collect(Collectors.toSet()));
        var users=userRepository.findAllById(values.stream().flatMap(v -> java.util.stream.Stream.of(v.getEmployeeId(),v.getCustomerId()))
                .collect(Collectors.toSet())).stream().collect(Collectors.toMap(User::getId,Function.identity()));
        Map<UUID,ReservationResponse> result=new java.util.LinkedHashMap<>();
        for(Reservation value:values){
            boolean canManage=resourceAccess.canManage(actor,value.getResourceId(),assigned);
            boolean readOnly=actor.role()==Role.EMPLOYEE&&!canManage;
            result.put(value.getId(),ReservationResponse.from(value,value.getResourceId()==null?null:resources.get(value.getResourceId()),value.getLocationId()==null?null:locations.get(value.getLocationId()),
                    requirements.get(value.getServiceId()),services.get(value.getServiceId()).name(),
                    readOnly ? "Klijent" : users.get(value.getCustomerId()).getName(),users.get(value.getEmployeeId()).getName(),
                    canManage,readOnly,canEdit(actor,value,canManage),
                    transitionPolicy.allowedActions(actor,value,requirements.get(value.getServiceId()),canManage)));
        }
        return result;
    }

    private Specification<Reservation> scopeFilter(ReservationScope scope,UUID resourceId,UUID locationId) {
        var actor=currentUserProvider.requireCurrentUser();
        Specification<Reservation> filter=ReservationSpecifications.hasResource(resourceId)
                .and(ReservationSpecifications.hasLocation(locationId));
        if(scope==ReservationScope.MANAGEABLE && actor.role()==Role.EMPLOYEE)
            filter=filter.and(ReservationSpecifications.inResources(resourceAccess.assignedResources(actor)));
        return filter;
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
        return listInternal(customerId,employeeId,status,from,to,page,size,sort,direction,ReservationScope.ALL,null,null);
    }

    private PageResponse<ReservationResponse> listInternal(UUID customerId,UUID employeeId,ReservationStatus status,
            LocalDate from,LocalDate to,int page,int size,String sort,String direction,
            ReservationScope scope,UUID resourceId,UUID locationId) {
        return listInternal(customerId, employeeId, status, from, to, page, size, sort, direction,
                scope, resourceId, locationId, null);
    }

    private Specification<Reservation> textFilter(String search) {
        if (search != null && search.length() > 120)
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Search must not exceed 120 characters");
        if (search == null || search.isBlank()) return (root, query, builder) -> builder.conjunction();
        var actor = currentUserProvider.requireCurrentUser();
        return ReservationSpecifications.matchesText(search,
                resourceAccess.allResources(actor) ? null : resourceAccess.assignedResources(actor));
    }

    private PageResponse<ReservationResponse> listInternal(UUID customerId,UUID employeeId,ReservationStatus status,
            LocalDate from,LocalDate to,int page,int size,String sort,String direction,
            ReservationScope scope,UUID resourceId,UUID locationId,String search) {
        validateDateRange(from, to);
        ZoneId zone = workingHoursService.getBusinessZone();
        Instant fromInstant = from == null ? null : from.atStartOfDay(zone).toInstant();
        Instant toInstant = to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant();

        Specification<Reservation> specification =
                scopeFilter(scope,resourceId,locationId);
        specification = specification
                .and(ReservationSpecifications.hasCustomer(customerId))
                .and(ReservationSpecifications.hasEmployee(employeeId))
                .and(ReservationSpecifications.hasStatus(status))
                .and(ReservationSpecifications.startsFrom(fromInstant))
                .and(ReservationSpecifications.startsBefore(toInstant))
                .and(textFilter(search));
        var pageable = pageRequestFactory.create(page, size, sort, direction, ALLOWED_SORTS);
        Page<Reservation> values = reservationRepository.findAll(specification,
                org.springframework.data.domain.PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                        pageable.getSort().and(org.springframework.data.domain.Sort.by("id"))));
        Map<UUID,ReservationResponse> mapped=responses(values.getContent());
        return PageResponse.from(values.map(value -> mapped.get(value.getId())));
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
            availabilityPolicy.requireAvailableForUpdate(employee.getId(), start, end, null);
            return employee;
        }
        List<User> employees = userRepository.findActiveEmployeesForUpdate();
        if (employees.isEmpty()) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "No active employees are available for booking");
        }
        return employees.stream()
                .filter(employee -> availabilityPolicy.isAvailableForUpdate(employee.getId(), start, end, null))
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
