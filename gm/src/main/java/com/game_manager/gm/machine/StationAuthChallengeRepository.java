package com.game_manager.gm.machine;
import jakarta.persistence.LockModeType;import java.util.*;import org.springframework.data.jpa.repository.*;import org.springframework.data.repository.query.Param;
public interface StationAuthChallengeRepository extends JpaRepository<StationAuthChallenge,UUID>{
 @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select c from StationAuthChallenge c where c.id=:id")Optional<StationAuthChallenge> findByIdForUpdate(@Param("id")UUID id);
}
