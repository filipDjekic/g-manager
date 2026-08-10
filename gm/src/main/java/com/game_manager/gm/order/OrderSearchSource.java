package com.game_manager.gm.order;

import com.game_manager.gm.common.search.SearchEntry;
import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.search.SearchSource;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class OrderSearchSource implements SearchSource {
    private final OrderRepository repository;
    @Override public SearchResourceType type() { return SearchResourceType.ORDER; }

    @Override
    public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        Specification<Order> visible = visibility(actor);
        if (visible == null) return List.of();
        return repository.findAll(visible.and(OrderSpecifications.matchesSearch(query)), PageRequest.of(0, limit))
                .stream().map(order -> entry(actor, order)).toList();
    }

    @Override
    public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        Specification<Order> visible = visibility(actor);
        if (visible == null) return Optional.empty();
        return repository.findOne(visible.and((root, ignored, builder) -> builder.equal(root.get("id"), id)))
                .map(order -> entry(actor, order));
    }

    private Specification<Order> visibility(AuthenticatedUser actor) {
        if (RolePermissions.has(actor.role(), Permission.ORDER_READ_ALL)) return (root, ignored, builder) -> builder.conjunction();
        if (RolePermissions.has(actor.role(), Permission.ORDER_READ_OWN)) return OrderSpecifications.hasCustomer(actor.id());
        return null;
    }
    private SearchEntry entry(AuthenticatedUser actor, Order order) {
        String route = RolePermissions.has(actor.role(), Permission.ORDER_READ_ALL) ? "/orders" : "/my-orders";
        return new SearchEntry(type(), order.getId(), "Narudžbina " + shortId(order.getId()),
                order.getStatus() + " · " + order.getTotalPrice() + " RSD", route + "?focus=" + order.getId(), 60);
    }
    private String shortId(UUID id) { return "#" + id.toString().substring(0, 8); }
}
