package com.game_manager.gm.order;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogService;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.order.dto.CreateOrderRequest;
import com.game_manager.gm.order.dto.OrderItemRequest;
import com.game_manager.gm.order.dto.OrderResponse;
import com.game_manager.gm.order.dto.UpdateOrderStatusRequest;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.events.DomainEventType;
import com.game_manager.gm.events.OutboxWriter;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
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
public class OrderService {
    private static final Set<String> ALLOWED_SORTS =
            Set.of("createdAt", "updatedAt", "status", "totalPrice");

    private final OrderRepository orderRepository;
    private final CatalogService catalogService;
    private final CurrentUserProvider currentUserProvider;
    private final GManagerProperties properties;
    private final PageRequestFactory pageRequestFactory;
    private final OrderAuthorizationPolicy authorizationPolicy;
    private final AuditWriter auditWriter;
    private final OutboxWriter outboxWriter;

    @Transactional
    @PreAuthorize("hasAuthority('ORDER_CREATE')")
    public OrderResponse create(CreateOrderRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Only customers can create orders");
        }
        rejectDuplicateProducts(request);

        Order order = new Order();
        order.setCustomerId(actor.id());
        order.setStatus(OrderStatus.CREATED);
        BigDecimal total = BigDecimal.ZERO;
        for (OrderItemRequest requestedItem : request.items()) {
            CatalogItem product = catalogService.getActiveById(requestedItem.productId());
            if (product.getType() != ItemType.PRODUCT) {
                throw new ApplicationException(
                        HttpStatus.UNPROCESSABLE_ENTITY, "Only products can be added to an order");
            }
            BigDecimal lineTotal = product.getPrice().multiply(BigDecimal.valueOf(requestedItem.quantity()));
            OrderItem item = new OrderItem();
            item.setProductId(product.getId());
            item.setQuantity(requestedItem.quantity());
            item.setUnitPrice(product.getPrice());
            item.setLineTotal(lineTotal);
            order.addItem(item);
            total = total.add(lineTotal);
        }
        order.setTotalPrice(total);
        Order saved = orderRepository.saveAndFlush(order);
        outboxWriter.write(DomainEventType.ORDER_CREATED, "ORDER", saved.getId(),
                java.util.Map.of("status", saved.getStatus().name()));
        return OrderResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('ORDER_READ_OWN')")
    public PageResponse<OrderResponse> listMine(
            OrderStatus status, LocalDate from, LocalDate to,
            int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Customer access is required");
        }
        return listInternal(actor.id(), null, status, from, to, page, size, sort, direction);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('ORDER_READ_ALL')")
    public PageResponse<OrderResponse> listAll(
            UUID handledBy, OrderStatus status, LocalDate from, LocalDate to,
            int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.EMPLOYEE && actor.role() != Role.ADMIN && actor.role() != Role.OWNER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Order management is not permitted");
        }
        return listInternal(null, handledBy, status, from, to, page, size, sort, direction);
    }

    @Transactional
    @PreAuthorize("hasAuthority('ORDER_CHANGE_STATUS')")
    public OrderResponse changeStatus(UUID id, UpdateOrderStatusRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Order not found"));
        requireVersion(order, request.version());
        validateTransition(order.getStatus(), request.status());
        authorizationPolicy.requireTransition(actor, order, request.status());
        OrderStatus previousStatus = order.getStatus();
        if (order.getStatus() == OrderStatus.CREATED && request.status() == OrderStatus.IN_PROGRESS) {
            order.setHandledBy(actor.id());
        }
        order.setStatus(request.status());
        Order saved = orderRepository.saveAndFlush(order);
        auditWriter.write("ORDER_STATUS_CHANGED", "ORDER", id,
                java.util.Map.of("status", previousStatus.name()),
                java.util.Map.of("status", saved.getStatus().name()), null, AuditVisibility.MANAGEMENT);
        outboxWriter.write(DomainEventType.ORDER_STATUS_CHANGED, "ORDER", saved.getId(),
                java.util.Map.of("previousStatus", previousStatus.name(),
                        "status", saved.getStatus().name()));
        return OrderResponse.from(saved);
    }

    private PageResponse<OrderResponse> listInternal(
            UUID customerId, UUID handledBy, OrderStatus status, LocalDate from, LocalDate to,
            int page, int size, String sort, String direction) {
        validateDateRange(from, to);
        ZoneId businessZone = properties.businessZone();
        Instant fromInstant = from == null ? null : from.atStartOfDay(businessZone).toInstant();
        Instant toInstant = to == null ? null : to.plusDays(1).atStartOfDay(businessZone).toInstant();
        Specification<Order> specification = (root, query, builder) -> builder.conjunction();
        specification = specification
                .and(OrderSpecifications.hasCustomer(customerId))
                .and(OrderSpecifications.hasHandler(handledBy))
                .and(OrderSpecifications.hasStatus(status))
                .and(OrderSpecifications.createdFrom(fromInstant))
                .and(OrderSpecifications.createdBefore(toInstant));
        Page<OrderResponse> result = orderRepository
                .findAll(specification,
                        pageRequestFactory.create(page, size, sort, direction, ALLOWED_SORTS))
                .map(OrderResponse::from);
        return PageResponse.from(result);
    }

    private static void validateTransition(OrderStatus current, OrderStatus target) {
        boolean valid = switch (current) {
            case CREATED -> target == OrderStatus.IN_PROGRESS || target == OrderStatus.CANCELLED;
            case IN_PROGRESS -> target == OrderStatus.READY || target == OrderStatus.CANCELLED;
            case READY -> target == OrderStatus.COMPLETED || target == OrderStatus.CANCELLED;
            case COMPLETED, CANCELLED -> false;
        };
        if (!valid) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Invalid order status transition");
        }
    }

    private static void requireVersion(Order order, Long expectedVersion) {
        if (!order.getVersion().equals(expectedVersion)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Order was changed; refresh and try again");
        }
    }

    private static void rejectDuplicateProducts(CreateOrderRequest request) {
        Set<UUID> products = new HashSet<>();
        if (request.items().stream().anyMatch(item -> !products.add(item.productId()))) {
            throw new ApplicationException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Each product may appear only once per order");
        }
    }

    private static void validateDateRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is not valid");
        }
    }

    @Transactional(readOnly = true)
    public OrderRevenueTotal completedRevenueBetween(Instant from, Instant to) {
        return orderRepository.completedRevenueBetween(from, to);
    }

    @Transactional(readOnly = true)
    public java.util.List<OrderAnalyticsRow> analyticsBetween(Instant from, Instant to) {
        return orderRepository.analyticsBetween(from, to);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<OrderNotificationContext> notificationContext(UUID id) {
        return orderRepository.findById(id).map(value -> new OrderNotificationContext(
                value.getCustomerId(), value.getHandledBy(), value.getStatus()));
    }

    @Transactional(readOnly = true)
    public long countByStatusToday(
            OrderStatus status, UUID handledBy, Instant from, Instant to) {
        return orderRepository.countByStatusBetween(status, handledBy, from, to);
    }
}
