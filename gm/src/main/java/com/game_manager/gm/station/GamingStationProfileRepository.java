package com.game_manager.gm.station;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GamingStationProfileRepository extends JpaRepository<GamingStationProfile, UUID> {
    Optional<GamingStationProfile> findByResourceId(UUID resourceId);
    List<GamingStationProfile> findByResourceIdIn(Collection<UUID> resourceIds);
    boolean existsByApplicationProfileId(UUID profileId);
}
