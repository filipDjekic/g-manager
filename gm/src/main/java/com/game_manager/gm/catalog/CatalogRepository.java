package com.game_manager.gm.catalog;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface CatalogRepository
        extends JpaRepository<CatalogItem, UUID>, JpaSpecificationExecutor<CatalogItem> {
}
