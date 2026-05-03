package com.gmanager.gmanager.catalog.repository;

import com.gmanager.gmanager.catalog.domain.CatalogItem;
import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogItemRepository extends JpaRepository<CatalogItem, Long> {

    Page<CatalogItem> findByActiveTrue(Pageable pageable);

    Page<CatalogItem> findByTypeAndActiveTrue(CatalogItemType type, Pageable pageable);

    Page<CatalogItem> findByType(CatalogItemType type, Pageable pageable);
}