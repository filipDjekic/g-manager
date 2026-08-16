package com.game_manager.gm.machine;
import jakarta.persistence.LockModeType;import java.util.*;import org.springframework.data.jpa.repository.*;import org.springframework.data.repository.query.Param;
public interface StationMachineIdentityRepository extends JpaRepository<StationMachineIdentity,UUID>{
 List<StationMachineIdentity> findByStationIdOrderByKeyVersionDesc(UUID stationId);
 List<StationMachineIdentity> findByStationIdAndStatusIn(UUID stationId,Collection<MachineIdentityStatus> statuses);
 boolean existsByPublicKeyFingerprint(String fingerprint);
 @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select i from StationMachineIdentity i where i.id=:id")Optional<StationMachineIdentity> findByIdForUpdate(@Param("id")UUID id);
}
