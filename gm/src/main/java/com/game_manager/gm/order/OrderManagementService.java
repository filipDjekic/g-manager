package com.game_manager.gm.order;

import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.RolePermissions;
import com.game_manager.gm.order.dto.OrderManagementItemResponse;
import com.game_manager.gm.order.dto.OrderManagementResponse;
import com.game_manager.gm.order.dto.OrderStatisticsResponse;
import com.game_manager.gm.user.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read projections for the management screen; mutations remain in OrderService. */
@Service
@RequiredArgsConstructor
public class OrderManagementService {
    private static final Set<String> ALLOWED_SORTS = Set.of("createdAt", "updatedAt", "status", "totalPrice");
    private final OrderRepository orders;
    private final UserRepository users;
    private final CatalogRepository catalog;
    private final CurrentUserProvider currentUser;
    private final PageRequestFactory pageRequests;
    private final GManagerProperties properties;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('ORDER_READ_ALL')")
    public PageResponse<OrderManagementResponse> list(UUID handledBy, OrderStatus status,
            LocalDate from, LocalDate to, String search, int page, int size, String sort, String direction) {
        var actor = requireStaff();
        validateDates(from, to);
        if (search != null && search.length() > 200)
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Pretraga može imati najviše 200 znakova.");
        var specification = OrderSpecifications.hasHandler(handledBy).and(OrderSpecifications.hasStatus(status))
                .and(OrderSpecifications.createdFrom(start(from)))
                .and(OrderSpecifications.createdBefore(end(to)))
                .and(OrderSpecifications.managementSearch(search, can(actor, Permission.CUSTOMER_READ),
                        can(actor, Permission.CATALOG_READ), !can(actor, Permission.CATALOG_MANAGE)));
        var request = pageRequests.create(page, size, sort, direction, ALLOWED_SORTS);
        var result = orders.findAll(specification, PageRequest.of(request.getPageNumber(), request.getPageSize(),
                request.getSort().and(Sort.by("id"))));
        if (result.isEmpty()) return new PageResponse<>(List.of(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
        // Fetch only this page's collections, without paginating a collection fetch join.
        var loaded = orders.findWithItems(result.getContent().stream().map(Order::getId).toList()).stream()
                .collect(Collectors.toMap(Order::getId, Function.identity()));
        var values = result.getContent().stream().map(value -> loaded.getOrDefault(value.getId(), value)).toList();
        return new PageResponse<>(project(values, actor), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('ORDER_READ_ALL')")
    public OrderManagementResponse get(UUID id) {
        var actor = requireStaff();
        var order = orders.findById(id).orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Narudžbina nije pronađena."));
        return project(List.of(order), actor).getFirst();
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('ORDER_READ_ALL')")
    public OrderStatisticsResponse statistics(LocalDate from, LocalDate to, UUID handledBy) {
        requireStaff();
        validateDates(from, to);
        var counts = orders.statistics(start(from), end(to), handledBy);
        return new OrderStatisticsResponse(counts.getTotal(), counts.getCompleted(), counts.getInProgress(),
                counts.getCancelled(), from, to, properties.businessZone().getId());
    }

    private List<OrderManagementResponse> project(List<Order> values, AuthenticatedUser actor) {
        Set<UUID> userIds = new HashSet<>();
        for (var value : values) {
            if (can(actor, Permission.CUSTOMER_READ)) userIds.add(value.getCustomerId());
            if (value.getHandledBy() != null && (value.getHandledBy().equals(actor.id())
                    || can(actor, Permission.EMPLOYEE_LIST) || can(actor, Permission.USER_LIST))) userIds.add(value.getHandledBy());
        }
        Map<UUID, UserRepository.DisplayName> names = userIds.isEmpty() ? Map.of() : users.displayNames(userIds).stream()
                .collect(Collectors.toMap(UserRepository.DisplayName::getId, Function.identity()));
        Set<UUID> productIds = values.stream().flatMap(value -> value.getItems().stream()).map(OrderItem::getProductId).collect(Collectors.toSet());
        Map<UUID, CatalogRepository.ProductDisplay> products = !can(actor, Permission.CATALOG_READ) || productIds.isEmpty()
                ? Map.of() : catalog.productDisplays(productIds, !can(actor, Permission.CATALOG_MANAGE)).stream()
                        .collect(Collectors.toMap(CatalogRepository.ProductDisplay::getId, Function.identity()));
        return values.stream().map(value -> {
            var customer = names.get(value.getCustomerId());
            String customerName = can(actor, Permission.CUSTOMER_READ) && customer != null && customer.getRole() == Role.CUSTOMER
                    ? customer.getName() : null;
            var handler = value.getHandledBy() == null ? null : names.get(value.getHandledBy());
            String handlerName = handler != null && (handler.getId().equals(actor.id()) || can(actor, Permission.USER_LIST)
                    || can(actor, Permission.EMPLOYEE_LIST) && handler.getRole() == Role.EMPLOYEE && handler.getActive()) ? handler.getName() : null;
            return new OrderManagementResponse(value.getId(), value.getCustomerId(), value.getHandledBy(), value.getStatus(), value.getTotalPrice(),
                    value.getItems().stream().map(item -> {
                        var product = products.get(item.getProductId());
                        return new OrderManagementItemResponse(item.getProductId(), item.getQuantity(), item.getUnitPrice(), item.getLineTotal(),
                                product == null ? null : product.getName(), product == null ? null : product.getImageUrl());
                    }).toList(), value.getCreatedAt(), value.getUpdatedAt(), value.getVersion(), customerName, handlerName);
        }).toList();
    }

    private AuthenticatedUser requireStaff() {
        var actor = currentUser.requireCurrentUser();
        if (actor.role() != Role.EMPLOYEE && actor.role() != Role.ADMIN && actor.role() != Role.OWNER)
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Order management is not permitted");
        return actor;
    }
    private static boolean can(AuthenticatedUser actor, Permission permission) { return RolePermissions.has(actor.role(), permission); }
    private Instant start(LocalDate date) { return date == null ? null : date.atStartOfDay(properties.businessZone()).toInstant(); }
    private Instant end(LocalDate date) { return date == null ? null : date.plusDays(1).atStartOfDay(properties.businessZone()).toInstant(); }
    private static void validateDates(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Datum početka ne može biti posle datuma završetka.");
    }
}
