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
    List<WaitlistEntry> findByStatusOrderByCreatedAtAsc(WaitlistStatus status,Pageable page);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.status=com.game_manager.gm.waitlist.WaitlistStatus.WAITING and w.desiredStart>:now and (:afterCreated is null or w.createdAt>:afterCreated or (w.createdAt=:afterCreated and w.id>:afterId)) order by w.createdAt,w.id")
    List<WaitlistEntry> waitingForUpdate(@Param("now") Instant now,@Param("afterCreated") Instant afterCreated,@Param("afterId") UUID afterId,Pageable page);

    @Query("""
            select new com.game_manager.gm.waitlist.dto.WaitlistOperationalResponse(
                w.id,w.customerId,c.name,w.employeeId,employee.name,w.serviceId,service.name,
                coalesce(area.locationId,w.locationId),location.name,resource.id,resource.name,w.createdAt,
                w.desiredStart,w.desiredEnd,w.status,offer.id,offer.expiresAt,offer.status,resource.code,w.version)
            from WaitlistEntry w
            join com.game_manager.gm.user.User c on c.id=w.customerId
            join com.game_manager.gm.user.User employee on employee.id=w.employeeId
            join com.game_manager.gm.catalog.CatalogItem service on service.id=w.serviceId
            left join WaitlistOffer offer on offer.entry.id=w.id
                and not exists (select newer.id from WaitlistOffer newer where newer.entry.id=w.id
                    and (newer.createdAt>offer.createdAt or (newer.createdAt=offer.createdAt and newer.id>offer.id)))
            left join com.game_manager.gm.resource.PhysicalResource resource on resource.id=w.resourceId
                or (w.resourceId is null and resource.id=offer.resourceId
                    and (offer.status=com.game_manager.gm.waitlist.WaitlistOfferStatus.ACCEPTED
                        or (offer.status=com.game_manager.gm.waitlist.WaitlistOfferStatus.OFFERED and offer.expiresAt>:now)))
            left join com.game_manager.gm.resource.Area area on area.id=resource.areaId
            left join com.game_manager.gm.resource.Location location on location.id=coalesce(area.locationId,w.locationId)
            where w.status in :statuses
                and (:from is null or w.desiredStart>=:from) and (:to is null or w.desiredStart<:to)
                and (:customerId is null or w.customerId=:customerId)
                and (:locationId is null or coalesce(area.locationId,w.locationId)=:locationId)
                and (:resourceId is null or resource.id=:resourceId)
                and (:search='' or lower(c.name) like :search or lower(service.name) like :search
                    or lower(resource.name) like :search or lower(resource.code) like :search or lower(location.name) like :search)
            order by w.createdAt asc,w.id asc
            """)
    org.springframework.data.domain.Page<com.game_manager.gm.waitlist.dto.WaitlistOperationalResponse> operational(
            @Param("statuses") Collection<WaitlistStatus> statuses,@Param("now") Instant now,@Param("from") Instant from,@Param("to") Instant to,
            @Param("customerId") UUID customerId,@Param("locationId") UUID locationId,@Param("resourceId") UUID resourceId,
            @Param("search") String search,Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WaitlistEntry w where w.id=:id")
    Optional<WaitlistEntry> findLocked(@Param("id") UUID id);
}
