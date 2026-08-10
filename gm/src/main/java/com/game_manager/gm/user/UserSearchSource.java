package com.game_manager.gm.user;

import com.game_manager.gm.common.search.SearchEntry;
import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.search.SearchSource;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.RolePermissions;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class UserSearchSource implements SearchSource {
    private final UserRepository repository;
    @Override public SearchResourceType type() { return SearchResourceType.USER; }

    @Override
    public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        if (!RolePermissions.has(actor.role(), Permission.USER_LIST)) return List.of();
        var spec = UserSpecifications.notDeleted().and(UserSpecifications.matchesSearch(query));
        if (actor.role() == Role.ADMIN) spec = spec.and(UserSpecifications.adminVisibleOnly(true));
        String term = query.toLowerCase(Locale.ROOT);
        return repository.findAll(spec, PageRequest.of(0, Math.min(limit * 3, 30))).stream()
                .map(user -> entry(user, term)).sorted(java.util.Comparator.comparingInt(SearchEntry::rank).reversed())
                .limit(limit).toList();
    }

    @Override
    public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        if (!RolePermissions.has(actor.role(), Permission.USER_LIST)) return Optional.empty();
        return repository.findById(id).filter(user -> !user.isDeleted())
                .filter(user -> actor.role() != Role.ADMIN || user.getRole() != Role.OWNER).map(user -> entry(user, ""));
    }

    private SearchEntry entry(User user, String term) {
        String name = user.getName();
        int rank = term.isBlank() ? 0 : user.getEmail().equalsIgnoreCase(term) ? 100
                : name.toLowerCase(Locale.ROOT).startsWith(term) ? 80 : 50;
        return new SearchEntry(type(), user.getId(), name, user.getRole() + " · " + user.getEmail(),
                "/users?focus=" + user.getId(), rank);
    }
}
