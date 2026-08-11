package com.game_manager.gm.reservation;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.reservation.dto.ChangeReservationStatusRequest;
import com.game_manager.gm.reservation.dto.CreateReservationRequest;
import com.game_manager.gm.reservation.dto.ReservationResponse;
import com.game_manager.gm.reservation.dto.ReservationDetailResponse;
import com.game_manager.gm.reservation.dto.BulkReservationStatusRequest;
import com.game_manager.gm.common.dto.BulkOperationResponse;
import com.game_manager.gm.common.observability.BulkOperationExecutor;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reservations")
@RequiredArgsConstructor
public class ReservationController {
    private final ReservationService reservationService;
    private final BulkOperationExecutor bulkOperationExecutor;

    @PostMapping
    public ResponseEntity<ReservationResponse> create(
            @Valid @RequestBody CreateReservationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.create(request));
    }

    @GetMapping("/me")
    public PageResponse<ReservationResponse> listMine(
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "startTime") String sort,
            @RequestParam(defaultValue = "DESC") String direction) {
        return reservationService.listMine(status, from, to, page, size, sort, direction);
    }

    @GetMapping
    public PageResponse<ReservationResponse> list(
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "startTime") String sort,
            @RequestParam(defaultValue = "ASC") String direction) {
        return reservationService.listAll(
                employeeId, status, from, to, page, size, sort, direction);
    }

    @GetMapping("/{id}")
    public ReservationDetailResponse get(@PathVariable UUID id) {
        return reservationService.getDetail(id);
    }

    @PatchMapping("/{id}/status")
    public ReservationResponse changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody ChangeReservationStatusRequest request) {
        return reservationService.changeStatus(id, request);
    }

    @PatchMapping("/bulk/status")
    public BulkOperationResponse bulkStatus(@Valid @RequestBody BulkReservationStatusRequest request) {
        return bulkOperationExecutor.execute("reservations", request.items(), item -> item.id(), item ->
                reservationService.changeStatus(item.id(), new ChangeReservationStatusRequest(
                        request.status(), request.note(), item.version())));
    }
}
