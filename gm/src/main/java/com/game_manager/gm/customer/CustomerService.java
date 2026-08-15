package com.game_manager.gm.customer;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.customer.dto.CustomerDetailResponse;
import com.game_manager.gm.customer.dto.CustomerListItemResponse;
import com.game_manager.gm.order.CustomerOrderSummary;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.reservation.CustomerReservationSummary;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.user.CustomerReference;
import com.game_manager.gm.user.UserService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CustomerService {
    private final UserService userService;
    private final ReservationService reservationService;
    private final OrderService orderService;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    public PageResponse<CustomerListItemResponse> list(
            String search, Boolean active, int page, int size) {
        PageResponse<CustomerReference> customers = userService.customerPage(search, active, page, size);
        Set<UUID> ids = customers.content().stream().map(CustomerReference::id).collect(Collectors.toSet());
        Map<UUID, CustomerReservationSummary> reservations = reservationService.summarizeCustomers(ids);
        Map<UUID, CustomerOrderSummary> orders = orderService.summarizeCustomers(ids);
        return new PageResponse<>(customers.content().stream()
                .map(customer -> response(customer, reservations.get(customer.id()), orders.get(customer.id())))
                .toList(), customers.page(), customers.size(), customers.totalElements(), customers.totalPages());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    public CustomerDetailResponse detail(UUID id) {
        CustomerReference customer = userService.customerReference(id);
        CustomerReservationSummary reservations = reservationService.summarizeCustomers(Set.of(id)).get(id);
        CustomerOrderSummary orders = orderService.summarizeCustomers(Set.of(id)).get(id);
        return new CustomerDetailResponse(response(customer, reservations, orders),
                reservationService.customerHistory(id, 20), orderService.customerHistory(id, 20));
    }

    private static CustomerListItemResponse response(CustomerReference customer,
            CustomerReservationSummary reservations, CustomerOrderSummary orders) {
        Instant lastReservation = reservations == null ? null : reservations.lastReservationAt();
        Instant lastOrder = orders == null ? null : orders.lastOrderAt();
        Instant lastActivity = lastReservation == null ? lastOrder
                : lastOrder == null || lastReservation.isAfter(lastOrder) ? lastReservation : lastOrder;
        return new CustomerListItemResponse(customer.id(), customer.name(), customer.email(), customer.active(),
                customer.createdAt(), reservations == null ? 0 : reservations.reservationCount(),
                reservations == null ? 0 : reservations.completedCount(), orders == null ? 0 : orders.orderCount(),
                orders == null ? 0 : orders.completedOrderCount(),
                orders == null ? BigDecimal.ZERO : orders.completedRevenue(), lastActivity,
                customer.version());
    }
}
