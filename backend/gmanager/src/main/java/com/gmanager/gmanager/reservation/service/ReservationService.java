package com.gmanager.gmanager.reservation.service;

import com.gmanager.gmanager.catalog.domain.CatalogItem;
import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import com.gmanager.gmanager.catalog.repository.CatalogItemRepository;
import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.ForbiddenException;
import com.gmanager.gmanager.common.exception.NotFoundException;
import com.gmanager.gmanager.security.user.SecurityUser;
import com.gmanager.gmanager.reservation.domain.Reservation;
import com.gmanager.gmanager.reservation.domain.ReservationStatus;
import com.gmanager.gmanager.reservation.domain.WorkingHours;
import com.gmanager.gmanager.reservation.dto.CreateReservationRequest;
import com.gmanager.gmanager.reservation.dto.ReservationResponse;
import com.gmanager.gmanager.reservation.dto.UpdateReservationStatusRequest;
import com.gmanager.gmanager.reservation.repository.ReservationRepository;
import com.gmanager.gmanager.reservation.repository.WorkingHoursRepository;
import com.gmanager.gmanager.user.domain.User;
import com.gmanager.gmanager.user.domain.UserRole;
import com.gmanager.gmanager.user.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.EnumSet;
import java.util.Set;

@Service
public class ReservationService {

    private static final Set<ReservationStatus> BLOCKING_STATUSES =
            EnumSet.of(ReservationStatus.PENDING, ReservationStatus.CONFIRMED);

    private final ReservationRepository reservationRepository;
    private final WorkingHoursRepository workingHoursRepository;
    private final UserRepository userRepository;
    private final CatalogItemRepository catalogItemRepository;

    public ReservationService(
            ReservationRepository reservationRepository,
            WorkingHoursRepository workingHoursRepository,
            UserRepository userRepository,
            CatalogItemRepository catalogItemRepository
    ) {
        this.reservationRepository = reservationRepository;
        this.workingHoursRepository = workingHoursRepository;
        this.userRepository = userRepository;
        this.catalogItemRepository = catalogItemRepository;
    }

    @Transactional(readOnly = true)
    public Page<ReservationResponse> getReservations(SecurityUser currentUser, ReservationStatus status, Pageable pageable) {
        User actor = currentUser.getUser();

        Page<Reservation> result;

        if (actor.getRole() == UserRole.CUSTOMER) {
            result = reservationRepository.findByCustomer(actor, pageable);
        } else if (actor.getRole() == UserRole.EMPLOYEE) {
            result = reservationRepository.findByEmployee(actor, pageable);
        } else {
            result = status == null
                    ? reservationRepository.findAll(pageable)
                    : reservationRepository.findByStatus(status, pageable);
        }

        return result.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public ReservationResponse getById(SecurityUser currentUser, Long id) {
        Reservation reservation = getReservationOrThrow(id);
        ensureCanView(currentUser.getUser(), reservation);

        return toResponse(reservation);
    }

    @Transactional
    public ReservationResponse create(SecurityUser currentUser, CreateReservationRequest request) {
        User customer = currentUser.getUser();

        if (customer.getRole() != UserRole.CUSTOMER) {
            throw new ForbiddenException("Only customers can create reservations");
        }

        User employee = userRepository.findById(request.employeeId())
                .orElseThrow(() -> new NotFoundException("Employee not found"));

        if (!employee.isActive() || employee.getRole() != UserRole.EMPLOYEE) {
            throw new BadRequestException("Reservation employee must be an active employee");
        }

        CatalogItem service = catalogItemRepository.findById(request.serviceId())
                .orElseThrow(() -> new NotFoundException("Service not found"));

        validateService(service);

        Instant startTime = request.startTime();
        Instant endTime = startTime.plus(Duration.ofMinutes(service.getDurationMinutes()));

        validateFuture(startTime);
        validateWorkingHours(startTime, endTime);
        validateNoOverlap(employee.getId(), startTime, endTime);

        Reservation reservation = new Reservation(
                customer,
                employee,
                service,
                startTime,
                endTime,
                normalizeNote(request.note())
        );

        return toResponse(reservationRepository.save(reservation));
    }

    @Transactional
    public ReservationResponse updateStatus(SecurityUser currentUser, Long id, UpdateReservationStatusRequest request) {
        Reservation reservation = getReservationOrThrow(id);

        ensureCanChangeStatus(currentUser.getUser(), reservation, request.status());
        applyStatus(reservation, request.status());

        return toResponse(reservation);
    }

    @Transactional
    public ReservationResponse cancelOwn(SecurityUser currentUser, Long id) {
        Reservation reservation = getReservationOrThrow(id);
        User actor = currentUser.getUser();

        if (actor.getRole() != UserRole.CUSTOMER || !reservation.getCustomer().getId().equals(actor.getId())) {
            throw new ForbiddenException("Access denied");
        }

        if (reservation.getStatus() == ReservationStatus.COMPLETED) {
            throw new BadRequestException("Completed reservation cannot be cancelled");
        }

        if (reservation.getStatus() == ReservationStatus.REJECTED) {
            throw new BadRequestException("Rejected reservation cannot be cancelled");
        }

        reservation.cancel();

        return toResponse(reservation);
    }

    private Reservation getReservationOrThrow(Long id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Reservation not found"));
    }

    private void validateService(CatalogItem service) {
        if (!service.isActive()) {
            throw new BadRequestException("Service is inactive");
        }

        if (service.getType() != CatalogItemType.SERVICE) {
            throw new BadRequestException("Only service catalog items can be reserved");
        }

        if (service.getDurationMinutes() == null || service.getDurationMinutes() <= 0) {
            throw new BadRequestException("Service must have valid duration");
        }
    }

    private void validateFuture(Instant startTime) {
        if (!startTime.isAfter(Instant.now())) {
            throw new BadRequestException("Reservation must be in the future");
        }
    }

    private void validateWorkingHours(Instant startTime, Instant endTime) {
        ZonedDateTime startBelgrade = startTime.atZone(ZoneId.of("Europe/Belgrade"));
        ZonedDateTime endBelgrade = endTime.atZone(ZoneId.of("Europe/Belgrade"));

        if (!startBelgrade.toLocalDate().equals(endBelgrade.toLocalDate())) {
            throw new BadRequestException("Reservation must start and end on the same day");
        }

        int dayOfWeek = startBelgrade.getDayOfWeek().getValue();

        WorkingHours workingHours = workingHoursRepository.findByDayOfWeek(dayOfWeek)
                .orElseThrow(() -> new BadRequestException("Working hours are not configured for this day"));

        if (!workingHours.isActive()) {
            throw new BadRequestException("Business is closed on this day");
        }

        LocalTime localStart = startBelgrade.toLocalTime();
        LocalTime localEnd = endBelgrade.toLocalTime();

        boolean insideWorkingHours =
                !localStart.isBefore(workingHours.getOpenTime())
                        && !localEnd.isAfter(workingHours.getCloseTime());

        if (!insideWorkingHours) {
            throw new BadRequestException("Reservation must be inside working hours");
        }
    }

    private void validateNoOverlap(Long employeeId, Instant startTime, Instant endTime) {
        boolean overlap = reservationRepository.existsEmployeeOverlap(
                employeeId,
                startTime,
                endTime,
                BLOCKING_STATUSES
        );

        if (overlap) {
            throw new BadRequestException("Employee already has a reservation in this time range");
        }
    }

    private void ensureCanView(User actor, Reservation reservation) {
        if (actor.getRole() == UserRole.OWNER || actor.getRole() == UserRole.ADMIN) {
            return;
        }

        if (actor.getRole() == UserRole.EMPLOYEE && reservation.getEmployee().getId().equals(actor.getId())) {
            return;
        }

        if (actor.getRole() == UserRole.CUSTOMER && reservation.getCustomer().getId().equals(actor.getId())) {
            return;
        }

        throw new ForbiddenException("Access denied");
    }

    private void ensureCanChangeStatus(User actor, Reservation reservation, ReservationStatus targetStatus) {
        if (actor.getRole() == UserRole.CUSTOMER) {
            throw new ForbiddenException("Access denied");
        }

        if (actor.getRole() == UserRole.EMPLOYEE && !reservation.getEmployee().getId().equals(actor.getId())) {
            throw new ForbiddenException("Access denied");
        }

        if (reservation.getStatus() == ReservationStatus.CANCELLED) {
            throw new BadRequestException("Cancelled reservation cannot be changed");
        }

        if (reservation.getStatus() == ReservationStatus.COMPLETED) {
            throw new BadRequestException("Completed reservation cannot be changed");
        }

        if (targetStatus == ReservationStatus.PENDING) {
            throw new BadRequestException("Reservation cannot be moved back to pending");
        }
    }

    private void applyStatus(Reservation reservation, ReservationStatus targetStatus) {
        switch (targetStatus) {
            case CONFIRMED -> reservation.confirm();
            case REJECTED -> reservation.reject();
            case CANCELLED -> reservation.cancel();
            case COMPLETED -> reservation.complete();
            case PENDING -> throw new BadRequestException("Reservation cannot be moved back to pending");
        }
    }

    private String normalizeNote(String note) {
        if (note == null || note.isBlank()) {
            return null;
        }

        return note.trim();
    }

    private ReservationResponse toResponse(Reservation reservation) {
        return new ReservationResponse(
                reservation.getId(),
                reservation.getCustomer().getId(),
                reservation.getCustomer().getName(),
                reservation.getEmployee().getId(),
                reservation.getEmployee().getName(),
                reservation.getService().getId(),
                reservation.getService().getName(),
                reservation.getStartTime(),
                reservation.getEndTime(),
                reservation.getStatus(),
                reservation.getNote(),
                reservation.getCreatedAt(),
                reservation.getUpdatedAt()
        );
    }
}