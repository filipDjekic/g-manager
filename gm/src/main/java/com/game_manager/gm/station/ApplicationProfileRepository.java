package com.game_manager.gm.station;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationProfileRepository extends JpaRepository<ApplicationProfile, UUID> {
    List<ApplicationProfile> findAllByOrderByNameAsc();
    boolean existsByCodeIgnoreCaseAndIdNot(String code, UUID id);
}
