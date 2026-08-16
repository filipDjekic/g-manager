package com.game_manager.gm.machine;
import jakarta.persistence.LockModeType;import java.util.*;import org.springframework.data.jpa.repository.*;import org.springframework.data.repository.query.Param;
public interface StationEnrollmentTokenRepository extends JpaRepository<StationEnrollmentToken,UUID>{
 @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select t from StationEnrollmentToken t where t.tokenHash=:hash")Optional<StationEnrollmentToken> findByHashForUpdate(@Param("hash")String hash);
 List<StationEnrollmentToken> findByStationIdAndStatus(UUID stationId,EnrollmentTokenStatus status);
}
