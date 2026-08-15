package com.game_manager.gm.station;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationProfileEntryRepository extends JpaRepository<ApplicationProfileEntry, UUID> {
    List<ApplicationProfileEntry> findByProfileIdOrderByLaunchOrderAscIdAsc(UUID profileId);
    List<ApplicationProfileEntry> findByProfileIdInOrderByLaunchOrderAscIdAsc(Collection<UUID> profileIds);
    void deleteByProfileId(UUID profileId);
    boolean existsByApplicationDefinitionId(UUID applicationDefinitionId);
}
