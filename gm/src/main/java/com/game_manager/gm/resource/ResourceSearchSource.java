package com.game_manager.gm.resource;

import com.game_manager.gm.common.search.*;
import com.game_manager.gm.common.security.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ResourceSearchSource implements SearchSource {
    private final PhysicalResourceRepository resources;

    @Override public SearchResourceType type() { return SearchResourceType.RESOURCE; }

    @Override public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        if (!RolePermissions.has(actor.role(), Permission.RESOURCE_READ)) return List.of();
        return resources.search(query.toLowerCase(Locale.ROOT), actor.role() == Role.CUSTOMER, null,
                PageRequest.of(0, limit)).stream().map(resource -> entry(resource, query)).toList();
    }

    @Override public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        if (!RolePermissions.has(actor.role(), Permission.RESOURCE_READ)) return Optional.empty();
        return resources.search("", actor.role() == Role.CUSTOMER, id, PageRequest.of(0, 1)).stream()
                .findFirst().map(resource -> entry(resource, ""));
    }

    private SearchEntry entry(com.game_manager.gm.resource.dto.ResourceSearchReference resource, String query) {
        return new SearchEntry(type(), resource.id(), resource.name(), resource.code() + " · " + resource.type(),
                "/resources?locationId=" + resource.locationId() + "&areaId=" + resource.areaId()
                        + "&resourceId=" + resource.id(), resource.code().equalsIgnoreCase(query) ? 100 : 70);
    }
}
