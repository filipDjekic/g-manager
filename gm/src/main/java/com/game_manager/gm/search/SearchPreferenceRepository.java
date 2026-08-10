package com.game_manager.gm.search;

import com.game_manager.gm.common.search.SearchResourceType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface SearchPreferenceRepository extends JpaRepository<SearchPreference, UUID> {
    Optional<SearchPreference> findByOwnerIdAndResourceTypeAndResourceId(UUID ownerId, SearchResourceType type, UUID resourceId);
    List<SearchPreference> findByOwnerIdOrderByLastAccessedAtDesc(UUID ownerId, Pageable pageable);
    List<SearchPreference> findByOwnerIdAndFavoriteTrueOrderByUpdatedAtDesc(UUID ownerId, Pageable pageable);
    List<SearchPreference> findByOwnerIdAndResourceTypeAndResourceIdIn(UUID ownerId, SearchResourceType type, List<UUID> ids);
}
