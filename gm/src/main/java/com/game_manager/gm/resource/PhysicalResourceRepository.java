package com.game_manager.gm.resource;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface PhysicalResourceRepository extends JpaRepository<PhysicalResource,UUID>{
 List<PhysicalResource> findByAreaIdOrderByDisplayOrderAscNameAsc(UUID areaId);
 List<PhysicalResource> findByServiceIdAndActiveTrueAndBookableTrueOrderByDisplayOrderAscNameAsc(UUID serviceId);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from PhysicalResource r where r.id=:id") Optional<PhysicalResource> findLocked(@Param("id") UUID id);
}
