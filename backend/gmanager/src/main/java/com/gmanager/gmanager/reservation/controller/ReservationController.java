package com.gmanager.gmanager.reservation.controller;

import com.gmanager.gmanager.reservation.domain.ReservationStatus;
import com.gmanager.gmanager.reservation.dto.CreateReservationRequest;
import com.gmanager.gmanager.reservation.dto.ReservationResponse;
import com.gmanager.gmanager.reservation.dto.UpdateReservationStatusRequest;
import com.gmanager.gmanager.reservation.service.ReservationService;
import com.gmanager.gmanager.security.authorization.IsAuthenticatedUser;
import com.gmanager.gmanager.security.authorization.IsOwnerAdminOrEmployee;
import com.gmanager.gmanager.security.user.SecurityUser;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reservations")
@IsAuthenticatedUser
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @GetMapping
    public Page<ReservationResponse> getReservations(
            @AuthenticationPrincipal SecurityUser currentUser,
            @RequestParam(required = false) ReservationStatus status,
            @PageableDefault(size = 20, sort = "startTime") Pageable pageable
    ) {
        return reservationService.getReservations(currentUser, status, pageable);
    }

    @GetMapping("/{id}")
    public ReservationResponse getById(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id
    ) {
        return reservationService.getById(currentUser, id);
    }

    @PostMapping
    public ReservationResponse create(
            @AuthenticationPrincipal SecurityUser currentUser,
            @Valid @RequestBody CreateReservationRequest request
    ) {
        return reservationService.create(currentUser, request);
    }

    @PatchMapping("/{id}/status")
    @IsOwnerAdminOrEmployee
    public ReservationResponse updateStatus(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id,
            @Valid @RequestBody UpdateReservationStatusRequest request
    ) {
        return reservationService.updateStatus(currentUser, id, request);
    }

    @PatchMapping("/{id}/cancel")
    public ReservationResponse cancelOwn(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id
    ) {
        return reservationService.cancelOwn(currentUser, id);
    }
}