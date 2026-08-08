package com.game_manager.gm.catalog;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface CatalogRepository
        extends JpaRepository<CatalogItem, UUID>, JpaSpecificationExecutor<CatalogItem> {
    @Override
    @Query("select item from CatalogItem item where item.id = :id and item.deletedAt is null")
    Optional<CatalogItem> findById(@Param("id") UUID id);

    @Query("select item from CatalogItem item where item.id = :id and item.deletedAt is not null")
    Optional<CatalogItem> findDeletedById(@Param("id") UUID id);
}
