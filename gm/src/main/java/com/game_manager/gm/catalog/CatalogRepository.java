package com.game_manager.gm.catalog;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface CatalogRepository
        extends JpaRepository<CatalogItem, UUID>, JpaSpecificationExecutor<CatalogItem> {
    interface Statistics {
        long getServiceCount();
        long getActiveServiceCount();
        long getProductCount();
        long getInactiveCount();
    }

    @Query("""
            select coalesce(sum(case when item.type = com.game_manager.gm.catalog.ItemType.SERVICE
                then 1 else 0 end), 0) as serviceCount,
              coalesce(sum(case when item.type = com.game_manager.gm.catalog.ItemType.SERVICE
                and item.active = true then 1 else 0 end), 0) as activeServiceCount,
              coalesce(sum(case when item.type = com.game_manager.gm.catalog.ItemType.PRODUCT
                then 1 else 0 end), 0) as productCount,
              coalesce(sum(case when item.active = false then 1 else 0 end), 0) as inactiveCount
            from CatalogItem item
            where item.deletedAt is null and (:activeOnly = false or item.active = true)
            """)
    Statistics statistics(@Param("activeOnly") boolean activeOnly);

    @Query("select count(r) > 0 from PhysicalResource r where r.serviceId = :id")
    boolean hasPhysicalResources(@Param("id") UUID id);

    @Override
    @Query("select item from CatalogItem item where item.id = :id and item.deletedAt is null")
    Optional<CatalogItem> findById(@Param("id") UUID id);

    @Query("select item from CatalogItem item where item.id = :id and item.deletedAt is not null")
    Optional<CatalogItem> findDeletedById(@Param("id") UUID id);
}
