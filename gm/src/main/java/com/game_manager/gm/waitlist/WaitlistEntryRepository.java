package com.game_manager.gm.waitlist;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface WaitlistEntryRepository extends JpaRepository<WaitlistEntry, UUID> {
    List<WaitlistEntry> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    List<WaitlistEntry> findByStatusOrderByCreatedAtAsc(WaitlistStatus status, Pageable page);
    @Query("""
            select new com.game_manager.gm.waitlist.dto.WaitlistOperationalResponse(
                w.id, w.customerId, c.name, w.employeeId, employee.name, w.serviceId, service.name,
                w.locationId, location.name, w.resourceId, resource.name, w.createdAt,
                w.desiredStart, w.desiredEnd, w.status, offer.id, offer.expiresAt)
            from WaitlistEntry w
            join com.game_manager.gm.user.User c on c.id = w.customerId
            join com.game_manager.gm.user.User employee on employee.id = w.employeeId
            join com.game_manager.gm.catalog.CatalogItem service on service.id = w.serviceId
            left join com.game_manager.gm.resource.Location location on location.id = w.locationId
            left join com.game_manager.gm.resource.PhysicalResource resource on resource.id = w.resourceId
            left join WaitlistOffer offer on offer.entry.id = w.id
                and offer.status = com.game_manager.gm.waitlist.WaitlistOfferStatus.OFFERED
            where w.status in :statuses and w.desiredStart > :now
                and (:employeeId is null or w.employeeId = :employeeId)
                and (:customerId is null or w.customerId = :customerId)
                and (:search = '' or lower(c.name) like :search or lower(service.name) like :search
                    or lower(resource.name) like :search)
            order by w.createdAt asc, w.id asc
            """)
    org.springframework.data.domain.Page<com.game_manager.gm.waitlist.dto.WaitlistOperationalResponse> operational(
            @Param("statuses") Collection<WaitlistStatus> statuses,
            @Param("now") java.time.Instant now, @Param("employeeId") UUID employeeId,
            @Param("customerId") UUID customerId, @Param("search") String search, Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.id=:id")
    Optional<WaitlistEntry> findLocked(@Param("id") UUID id);
}
