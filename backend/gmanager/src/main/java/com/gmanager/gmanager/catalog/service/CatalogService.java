package com.gmanager.gmanager.catalog.service;

import com.gmanager.gmanager.catalog.domain.CatalogItem;
import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import com.gmanager.gmanager.catalog.dto.*;
import com.gmanager.gmanager.catalog.repository.CatalogItemRepository;
import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.NotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    private final CatalogItemRepository catalogItemRepository;

    public CatalogService(CatalogItemRepository catalogItemRepository) {
        this.catalogItemRepository = catalogItemRepository;
    }

    @Transactional(readOnly = true)
    public Page<CatalogItemResponse> getPublicCatalog(CatalogItemType type, Pageable pageable) {
        Page<CatalogItem> result = type == null
                ? catalogItemRepository.findByActiveTrue(pageable)
                : catalogItemRepository.findByTypeAndActiveTrue(type, pageable);

        return result.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<CatalogItemResponse> getManagedCatalog(CatalogItemType type, Pageable pageable) {
        Page<CatalogItem> result = type == null
                ? catalogItemRepository.findAll(pageable)
                : catalogItemRepository.findByType(type, pageable);

        return result.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public CatalogItemResponse getById(Long id) {
        CatalogItem item = getItemOrThrow(id);

        if (!item.isActive()) {
            throw new NotFoundException("Catalog item not found");
        }

        return toResponse(item);
    }

    @Transactional(readOnly = true)
    public CatalogItemResponse getManagedById(Long id) {
        return toResponse(getItemOrThrow(id));
    }

    @Transactional
    public CatalogItemResponse create(CreateCatalogItemRequest request) {
        validateTypeRules(request.type(), request.durationMinutes());

        CatalogItem item = new CatalogItem(
                request.name().trim(),
                normalizeDescription(request.description()),
                request.type(),
                request.price(),
                request.durationMinutes()
        );

        return toResponse(catalogItemRepository.save(item));
    }

    @Transactional
    public CatalogItemResponse update(Long id, UpdateCatalogItemRequest request) {
        validateTypeRules(request.type(), request.durationMinutes());

        CatalogItem item = getItemOrThrow(id);

        item.update(
                request.name().trim(),
                normalizeDescription(request.description()),
                request.type(),
                request.price(),
                request.durationMinutes()
        );

        return toResponse(item);
    }

    @Transactional
    public CatalogItemResponse updateStatus(Long id, UpdateCatalogItemStatusRequest request) {
        CatalogItem item = getItemOrThrow(id);
        item.setActive(request.active());

        return toResponse(item);
    }

    @Transactional
    public void deactivate(Long id) {
        CatalogItem item = getItemOrThrow(id);
        item.setActive(false);
    }

    private CatalogItem getItemOrThrow(Long id) {
        return catalogItemRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Catalog item not found"));
    }

    private void validateTypeRules(CatalogItemType type, Integer durationMinutes) {
        if (type == CatalogItemType.SERVICE && durationMinutes == null) {
            throw new BadRequestException("Service must have duration");
        }

        if (type == CatalogItemType.PRODUCT && durationMinutes != null) {
            throw new BadRequestException("Product must not have duration");
        }
    }

    private String normalizeDescription(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }

        return description.trim();
    }

    private CatalogItemResponse toResponse(CatalogItem item) {
        return new CatalogItemResponse(
                item.getId(),
                item.getName(),
                item.getDescription(),
                item.getType(),
                item.getPrice(),
                item.getDurationMinutes(),
                item.isActive(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }
}