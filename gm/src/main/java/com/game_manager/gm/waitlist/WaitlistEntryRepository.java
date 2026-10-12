package com.game_manager.gm.waitlist;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface WaitlistEntryRepository extends JpaRepository<WaitlistEntry,UUID> {
    boolean existsByActiveKey(String activeKey);
    List<WaitlistEntry> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.status=com.game_manager.gm.waitlist.WaitlistStatus.WAITING and w.desiredStart>:now and (:afterCreated is null or w.queueEnteredAt>:afterCreated or (w.queueEnteredAt=:afterCreated and w.id>:afterId)) order by w.queueEnteredAt,w.id")
    List<WaitlistEntry> waitingForUpdate(@Param("now") Instant now,@Param("afterCreated") Instant afterCreated,@Param("afterId") UUID afterId,Pageable page);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.id=:id")
    Optional<WaitlistEntry> findLocked(@Param("id") UUID id);
}
