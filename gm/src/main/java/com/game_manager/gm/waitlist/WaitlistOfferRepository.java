package com.game_manager.gm.waitlist;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface WaitlistOfferRepository extends JpaRepository<WaitlistOffer,UUID> {
    Optional<WaitlistOffer> findByEntryIdAndStatus(UUID entryId,WaitlistOfferStatus status);
    @Query("select o from WaitlistOffer o join fetch o.entry where o.entry.customerId=:customer order by o.createdAt desc,o.id desc")
    List<WaitlistOffer> customerOffers(@Param("customer") UUID customer);
    List<WaitlistOffer> findByStatusAndExpiresAtLessThanEqual(WaitlistOfferStatus status,Instant now);
    boolean existsByStatusAndEmployeeIdAndEntry_DesiredStart(WaitlistOfferStatus status,UUID employeeId,Instant desiredStart);
    @Query("""
            select count(o) from WaitlistOffer o where o.status=com.game_manager.gm.waitlist.WaitlistOfferStatus.OFFERED
              and o.expiresAt>:now and o.entry.desiredStart<:end and o.entry.desiredEnd>:start
              and (o.employeeId=:employee or (:resource is not null and o.resourceId=:resource))
            """)
    long overlappingOffers(@Param("employee") UUID employee,@Param("resource") UUID resource,
            @Param("start") Instant start,@Param("end") Instant end,@Param("now") Instant now);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from WaitlistOffer o where o.id=:id")
    Optional<WaitlistOffer> findLocked(@Param("id") UUID id);
}
