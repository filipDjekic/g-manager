package com.game_manager.gm.common.search;

import com.game_manager.gm.common.security.AuthenticatedUser;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SearchSource {
    SearchResourceType type();
    List<SearchEntry> search(AuthenticatedUser actor, String query, int limit);
    Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id);
}
