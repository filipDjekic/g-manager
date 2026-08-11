package com.game_manager.gm.waitlist;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface WaitlistEntryRepository extends JpaRepository<WaitlistEntry, UUID> {
    List<WaitlistEntry> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    List<WaitlistEntry> findByStatusOrderByCreatedAtAsc(WaitlistStatus status, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.id=:id")
    Optional<WaitlistEntry> findLocked(@Param("id") UUID id);
}
