package com.game_manager.gm.order;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.order.dto.CreateOrderRequest;
import com.game_manager.gm.order.dto.OrderResponse;
import com.game_manager.gm.order.dto.UpdateOrderStatusRequest;
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
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(orderService.create(request));
    }

    @GetMapping("/me")
    public PageResponse<OrderResponse> listMine(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "DESC") String direction) {
        return orderService.listMine(status, from, to, page, size, sort, direction);
    }

    @GetMapping
    public PageResponse<OrderResponse> list(
            @RequestParam(required = false) UUID handledBy,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "DESC") String direction) {
        return orderService.listAll(handledBy, status, from, to, page, size, sort, direction);
    }

    @PatchMapping("/{id}/status")
    public OrderResponse changeStatus(
            @PathVariable UUID id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return orderService.changeStatus(id, request);
    }
}
