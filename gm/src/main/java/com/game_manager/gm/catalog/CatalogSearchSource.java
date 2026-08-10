package com.game_manager.gm.catalog;

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
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CatalogSearchSource implements SearchSource {
    private final CatalogRepository repository;
    @Override public SearchResourceType type() { return SearchResourceType.CATALOG; }

    @Override
    public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        if (!RolePermissions.has(actor.role(), Permission.CATALOG_READ)) return List.of();
        boolean manage = RolePermissions.has(actor.role(), Permission.CATALOG_MANAGE);
        String term = query.toLowerCase(Locale.ROOT);
        Specification<CatalogItem> visible = CatalogSpecifications.notDeleted();
        if (!manage) visible = visible.and(CatalogSpecifications.isActive(true));
        Specification<CatalogItem> matches = (root, ignored, builder) -> builder.or(
                builder.like(builder.lower(root.get("name")), "%" + term + "%"),
                builder.like(builder.lower(root.get("description")), "%" + term + "%"));
        return repository.findAll(visible.and(matches), PageRequest.of(0, Math.min(limit * 3, 30)))
                .stream().map(item -> entry(item, term)).sorted(java.util.Comparator.comparingInt(SearchEntry::rank).reversed())
                .limit(limit).toList();
    }

    @Override
    public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        if (!RolePermissions.has(actor.role(), Permission.CATALOG_READ)) return Optional.empty();
        boolean manage = RolePermissions.has(actor.role(), Permission.CATALOG_MANAGE);
        return repository.findById(id).filter(item -> !item.isDeleted())
                .filter(item -> manage || item.isActive()).map(item -> entry(item, ""));
    }

    private SearchEntry entry(CatalogItem item, String term) {
        String name = item.getName();
        int rank = term.isBlank() ? 0 : name.equalsIgnoreCase(term) ? 100 : name.toLowerCase(Locale.ROOT).startsWith(term) ? 80 : 50;
        return new SearchEntry(type(), item.getId(), name, item.getType() + " · " + item.getPrice() + " RSD",
                "/catalog?focus=" + item.getId(), rank);
    }
}
