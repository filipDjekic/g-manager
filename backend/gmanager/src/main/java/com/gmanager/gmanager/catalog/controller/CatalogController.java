package com.gmanager.gmanager.catalog.controller;

import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import com.gmanager.gmanager.catalog.dto.*;
import com.gmanager.gmanager.catalog.service.CatalogService;
import com.gmanager.gmanager.security.authorization.IsOwnerOrAdmin;
import com.gmanager.gmanager.security.authorization.IsOwnerAdminOrEmployee;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    public Page<CatalogItemResponse> getPublicCatalog(
            @RequestParam(required = false) CatalogItemType type,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable
    ) {
        return catalogService.getPublicCatalog(type, pageable);
    }

    @GetMapping("/{id}")
    public CatalogItemResponse getById(@PathVariable Long id) {
        return catalogService.getById(id);
    }

    @GetMapping("/management")
    @IsOwnerAdminOrEmployee
    public Page<CatalogItemResponse> getManagedCatalog(
            @RequestParam(required = false) CatalogItemType type,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable
    ) {
        return catalogService.getManagedCatalog(type, pageable);
    }

    @GetMapping("/management/{id}")
    @IsOwnerAdminOrEmployee
    public CatalogItemResponse getManagedById(@PathVariable Long id) {
        return catalogService.getManagedById(id);
    }

    @PostMapping
    @IsOwnerOrAdmin
    public CatalogItemResponse create(@Valid @RequestBody CreateCatalogItemRequest request) {
        return catalogService.create(request);
    }

    @PutMapping("/{id}")
    @IsOwnerOrAdmin
    public CatalogItemResponse update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCatalogItemRequest request
    ) {
        return catalogService.update(id, request);
    }

    @PatchMapping("/{id}/status")
    @IsOwnerOrAdmin
    public CatalogItemResponse updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCatalogItemStatusRequest request
    ) {
        return catalogService.updateStatus(id, request);
    }

    @DeleteMapping("/{id}")
    @IsOwnerOrAdmin
    public void deactivate(@PathVariable Long id) {
        catalogService.deactivate(id);
    }
}