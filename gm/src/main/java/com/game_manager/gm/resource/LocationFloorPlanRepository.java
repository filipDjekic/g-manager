package com.game_manager.gm.resource;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationFloorPlanRepository extends JpaRepository<LocationFloorPlan, UUID> {
    Optional<LocationFloorPlan> findByLocationId(UUID locationId);
}
