package com.game_manager.gm.waitlist;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface WaitlistOfferRepository extends JpaRepository<WaitlistOffer, UUID> {
    Optional<WaitlistOffer> findByEntryIdAndStatus(UUID entryId, WaitlistOfferStatus status);
    List<WaitlistOffer> findByStatusAndExpiresAtLessThanEqual(WaitlistOfferStatus status, Instant now);
    boolean existsByStatusAndEmployeeIdAndEntry_DesiredStart(
            WaitlistOfferStatus status, UUID employeeId, Instant desiredStart);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from WaitlistOffer o join fetch o.entry where o.id=:id")
    Optional<WaitlistOffer> findLocked(@Param("id") UUID id);
}
