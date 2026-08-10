package com.game_manager.gm.savedview;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface SavedViewRepository extends JpaRepository<SavedView, UUID> {
    List<SavedView> findAllByOwnerIdAndResourceTypeOrderByName(UUID ownerId, SavedViewResourceType resourceType);
    Optional<SavedView> findByIdAndOwnerId(UUID id, UUID ownerId);
}
