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
        return CatalogItemResponse.from(catalogRepository.saveAndFlush(item));
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
        return CatalogItemResponse.from(catalogRepository.saveAndFlush(item));
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse deactivate(UUID id, long version) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        item.setActive(false);
        return CatalogItemResponse.from(catalogRepository.saveAndFlush(item));
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse activate(UUID id, long version) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        item.setActive(true);
        return CatalogItemResponse.from(catalogRepository.saveAndFlush(item));
    }

    @Transactional
    @PreAuthorize("hasAuthority('CATALOG_MANAGE')")
    public CatalogItemResponse uploadImage(UUID id, long version, MultipartFile image) {
        requireManagement();
        CatalogItem item = requireItem(id);
        requireVersion(item, version);
        item.setImageUrl(fileStorageService.storeCatalogImage(image));
        return CatalogItemResponse.from(catalogRepository.saveAndFlush(item));
    }

    @Transactional(readOnly = true)
    public CatalogItem getActiveById(UUID id) {
        CatalogItem item = requireItem(id);
        if (!item.isActive()) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Catalog item is inactive");
        }
        return item;
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
}
