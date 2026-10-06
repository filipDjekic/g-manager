package com.game_manager.gm.resource;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface PhysicalResourceRepository extends JpaRepository<PhysicalResource,UUID>{
 List<PhysicalResource> findByTypeOrderByNameAsc(ResourceType type);
 List<PhysicalResource> findByAreaIdOrderByDisplayOrderAscNameAsc(UUID areaId);
 List<PhysicalResource> findByServiceIdAndActiveTrueAndBookableTrueOrderByDisplayOrderAscNameAsc(UUID serviceId);
 @Query("select new com.game_manager.gm.resource.dto.ResourceSearchReference(r.id,r.areaId,a.locationId,r.name,r.code,r.type) "
  + "from PhysicalResource r join Area a on a.id=r.areaId join Location l on l.id=a.locationId "
  + "where (:publicOnly=false or (r.active=true and r.bookable=true and l.active=true and a.active=true)) "
  + "and (:id is null or r.id=:id) "
  + "and (lower(r.name) like concat('%',:query,'%') or lower(r.code) like concat('%',:query,'%')) "
  + "order by r.name, r.id")
 List<com.game_manager.gm.resource.dto.ResourceSearchReference> search(@Param("query") String query,@Param("publicOnly") boolean publicOnly,@Param("id") UUID id,org.springframework.data.domain.Pageable page);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from PhysicalResource r where r.id=:id") Optional<PhysicalResource> findLocked(@Param("id") UUID id);
}
