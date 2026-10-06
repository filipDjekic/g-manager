package com.game_manager.gm.user;

import com.game_manager.gm.common.search.*;
import com.game_manager.gm.common.security.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CustomerSearchSource implements SearchSource {
    private final UserRepository users;

    @Override public SearchResourceType type() { return SearchResourceType.CUSTOMER; }

    @Override public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        if (!RolePermissions.has(actor.role(), Permission.CUSTOMER_READ)) return List.of();
        var spec = UserSpecifications.notDeleted().and(UserSpecifications.hasRole(Role.CUSTOMER))
                .and(UserSpecifications.matchesSearch(query));
        return users.findAll(spec, PageRequest.of(0, Math.min(limit * 3, 30))).stream()
                .map(user -> entry(user, query)).sorted(Comparator.comparingInt(SearchEntry::rank).reversed())
                .limit(limit).toList();
    }

    @Override public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        if (!RolePermissions.has(actor.role(), Permission.CUSTOMER_READ)) return Optional.empty();
        return users.findById(id).filter(user -> !user.isDeleted() && user.getRole() == Role.CUSTOMER)
                .map(user -> entry(user, ""));
    }

    private SearchEntry entry(User user, String query) {
        int rank = user.getEmail().equalsIgnoreCase(query) ? 100
                : user.getName().toLowerCase(Locale.ROOT).startsWith(query.toLowerCase(Locale.ROOT)) ? 80 : 50;
        return new SearchEntry(type(), user.getId(), user.getName(), user.getEmail(),
                "/customers?customerId=" + user.getId(), rank);
    }
}
