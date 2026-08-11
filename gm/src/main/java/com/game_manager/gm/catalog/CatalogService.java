package com.game_manager.gm.catalog;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.media.FileStorageService;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.catalog.dto.CatalogItemResponse;
import com.game_manager.gm.catalog.dto.CreateCatalogItemRequest;
import com.game_manager.gm.catalog.dto.UpdateCatalogItemRequest;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.dto.DeletionReasonRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class CatalogService {
    private static final Set<String> ALLOWED_SORTS = Set.of("name", "price", "type", "createdAt");

    private final CatalogRepository catalogRepository;
    private final CurrentUserProvider currentUserProvider;
    private final FileStorageService fileStorageService;
    private final PageRequestFactory pageRequestFactory;
    private final AuditWriter auditWriter;

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse create(CreateCatalogItemRequest request) {
        requireManagement();
        validateType(request.type(), request.durationMinutes());
        CatalogItem item = new CatalogItem();
        item.setName(request.name().trim());
        item.setDescription(normalizeDescription(request.description()));
        item.setType(request.type());
        item.setPrice(request.price());
        item.setDurationMinutes(request.durationMinutes());
        item.setActive(true);
        CatalogItem saved = catalogRepository.saveAndFlush(item);
        auditWriter.write("CATALOG_CREATED", "CATALOG_ITEM", saved.getId(), null,
                auditData(saved), null, AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CATALOG_READ')")
    public PageResponse<CatalogItemResponse> list(
            ItemType type,
            Boolean active,
            String search,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            int page,
            int size,
            String sort,
            String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        validatePriceRange(minPrice, maxPrice);

        Boolean effectiveActive = isManagement(actor.role()) ? active : Boolean.TRUE;
        Specification<CatalogItem> specification =
                (root, query, builder) -> builder.conjunction();
        specification = specification
                .and(CatalogSpecifications.notDeleted())
                .and(CatalogSpecifications.hasType(type))
                .and(CatalogSpecifications.isActive(effectiveActive))
                .and(CatalogSpecifications.nameContains(search))
                .and(CatalogSpecifications.priceBetween(minPrice, maxPrice));
        Page<CatalogItemResponse> result = catalogRepository
                .findAll(specification,
                        pageRequestFactory.create(page, size, sort, direction, ALLOWED_SORTS))
                .map(CatalogItemResponse::from);
        return PageResponse.from(result);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CATALOG_READ')")
    public CatalogItemResponse get(UUID id) {
        CatalogItem item = requireItem(id);
        Role role = currentUserProvider.requireCurrentUser().role();
        if (!item.isActive() && !isManagement(role)) {
            throw new ApplicationException(HttpStatus.NOT_FOUND, "Catalog item not found");
        }
        return CatalogItemResponse.from(item);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse update(UUID id, UpdateCatalogItemRequest request) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, request.version());
        Map<String, Object> before = auditData(item);

        ItemType candidateType = request.type() == null ? item.getType() : request.type();
        Integer candidateDuration;
        if (candidateType == ItemType.PRODUCT) {
            candidateDuration = request.durationMinutes();
        } else {
            candidateDuration =
                    request.durationMinutes() == null ? item.getDurationMinutes() : request.durationMinutes();
        }
        validateType(candidateType, candidateDuration);

        if (request.name() != null) {
            if (request.name().isBlank()) {
                throw new ApplicationException(HttpStatus.BAD_REQUEST, "Name must not be blank");
            }
            item.setName(request.name().trim());
        }
        if (request.description() != null) {
            item.setDescription(normalizeDescription(request.description()));
        }
        if (request.type() != null) {
            item.setType(candidateType);
        }
        if (request.price() != null) {
            item.setPrice(request.price());
        }
        item.setDurationMinutes(candidateDuration);
        CatalogItem saved = catalogRepository.saveAndFlush(item);
        auditWriter.write("CATALOG_UPDATED", "CATALOG_ITEM", id, before,
                auditData(saved), null, AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse deactivate(UUID id, long version) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        boolean previous = item.isActive();
        item.setActive(false);
        CatalogItem saved = catalogRepository.saveAndFlush(item);
        auditWriter.write("CATALOG_DEACTIVATED", "CATALOG_ITEM", id,
                Map.of("active", previous), Map.of("active", false), null, AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse activate(UUID id, long version) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        boolean previous = item.isActive();
        item.setActive(true);
        CatalogItem saved = catalogRepository.saveAndFlush(item);
        auditWriter.write("CATALOG_ACTIVATED", "CATALOG_ITEM", id,
                Map.of("active", previous), Map.of("active", true), null, AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse uploadImage(UUID id, long version, MultipartFile image) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        boolean hadImage = item.getImageUrl() != null;
        item.setImageUrl(fileStorageService.storeCatalogImage(id, image));
        CatalogItem saved = catalogRepository.saveAndFlush(item);
        auditWriter.write("CATALOG_IMAGE_UPDATED", "CATALOG_ITEM", id,
                Map.of("imagePresent", hadImage), Map.of("imagePresent", true), null,
                AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_DELETE')")
    public void delete(UUID id, DeletionReasonRequest request) {
        AuthenticatedUser actor = requireManagement();
        CatalogItem item = requireItem(id);
        Map<String, Object> before = auditData(item);
        item.softDelete(actor.id(), request.reason(), Instant.now());
        catalogRepository.save(item);
        auditWriter.write("CATALOG_DELETED", "CATALOG_ITEM", id, before,
                Map.of("deleted", true), request.reason(), AuditVisibility.MANAGEMENT);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_RESTORE')")
    public CatalogItemResponse restore(UUID id) {
        requireManagement();
        CatalogItem item = catalogRepository.findDeletedById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Deleted catalog item not found"));
        String reason = item.getDeletionReason();
        item.restore();
        CatalogItem saved = catalogRepository.save(item);
        auditWriter.write("CATALOG_RESTORED", "CATALOG_ITEM", id, Map.of("deleted", true),
                auditData(saved), reason, AuditVisibility.MANAGEMENT);
        return CatalogItemResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CATALOG_RESTORE')")
    public PageResponse<CatalogItemResponse> listDeleted(int page, int size) {
        requireManagement();
        return PageResponse.from(catalogRepository.findAll(CatalogSpecifications.deleted(),
                pageRequestFactory.create(page, size, org.springframework.data.domain.Sort.by("deletedAt").descending()))
                .map(CatalogItemResponse::from));
    }

    @Transactional(readOnly = true)
    public CatalogItem getActiveById(UUID id) {
        CatalogItem item = requireItem(id);
        if (!item.isActive()) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Catalog item is inactive");
        }
        return item;
    }

    @Transactional(readOnly = true)
    public CatalogReference getReference(UUID id) {
        CatalogItem item = requireItem(id);
        return new CatalogReference(item.getId(), item.getName(), item.getDurationMinutes());
    }

    @Transactional(readOnly = true)
    public Map<UUID, CatalogReference> getReferences(Set<UUID> ids) {
        return catalogRepository.findAllById(ids).stream().collect(java.util.stream.Collectors.toMap(
                CatalogItem::getId,
                item -> new CatalogReference(item.getId(), item.getName(), item.getDurationMinutes())));
    }

    private CatalogItem requireItem(UUID id) {
        return catalogRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Catalog item not found"));
    }

    private AuthenticatedUser requireManagement() {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (!isManagement(actor.role())) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Catalog management is not permitted");
        }
        return actor;
    }

    private static boolean isManagement(Role role) {
        return role == Role.OWNER || role == Role.ADMIN;
    }

    private static void validateType(ItemType type, Integer durationMinutes) {
        boolean valid = type == ItemType.SERVICE
                ? durationMinutes != null && durationMinutes > 0
                : durationMinutes == null;
        if (!valid) {
            throw new ApplicationException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    type == ItemType.SERVICE
                            ? "Services require a positive duration"
                            : "Products cannot have a duration");
        }
    }

    private static void validatePriceRange(BigDecimal minPrice, BigDecimal maxPrice) {
        if ((minPrice != null && minPrice.signum() < 0)
                || (maxPrice != null && maxPrice.signum() < 0)
                || (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Price range is not valid");
        }
    }

    private static void requireVersion(CatalogItem item, Long expectedVersion) {
        if (!item.getVersion().equals(expectedVersion)) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Catalog item was changed; refresh and try again");
        }
    }

    private static String normalizeDescription(String description) {
        return description == null || description.isBlank() ? null : description.trim();
    }

    private static Map<String, Object> auditData(CatalogItem item) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", item.getName()); data.put("description", item.getDescription());
        data.put("type", item.getType().name()); data.put("price", item.getPrice());
        data.put("durationMinutes", item.getDurationMinutes()); data.put("active", item.isActive());
        data.put("imagePresent", item.getImageUrl() != null);
        return data;
    }
}
