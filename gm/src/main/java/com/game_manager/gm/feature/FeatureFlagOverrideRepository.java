package com.game_manager.gm.feature;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface FeatureFlagOverrideRepository extends JpaRepository<FeatureFlagOverride, UUID> {
    Optional<FeatureFlagOverride> findByFlagKey(String flagKey);
}
