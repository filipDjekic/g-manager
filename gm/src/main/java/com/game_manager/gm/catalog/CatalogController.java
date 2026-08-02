package com.game_manager.gm.catalog;

import com.game_manager.gm.catalog.dto.CatalogItemResponse;
import com.game_manager.gm.catalog.dto.CreateCatalogItemRequest;
import com.game_manager.gm.catalog.dto.UpdateCatalogItemRequest;
import com.game_manager.gm.common.dto.PageResponse;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/catalog")
@RequiredArgsConstructor
public class CatalogController {
    private final CatalogService catalogService;

    @PostMapping
    public ResponseEntity<CatalogItemResponse> create(
            @Valid @RequestBody CreateCatalogItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(catalogService.create(request));
    }

    @GetMapping
    public PageResponse<CatalogItemResponse> list(
            @RequestParam(required = false) ItemType type,
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "DESC") String direction) {
        return catalogService.list(
                type, active, search, minPrice, maxPrice, page, size, sort, direction);
    }

    @GetMapping("/{id}")
    public CatalogItemResponse get(@PathVariable UUID id) {
        return catalogService.get(id);
    }

    @PatchMapping("/{id}")
    public CatalogItemResponse update(
            @PathVariable UUID id, @Valid @RequestBody UpdateCatalogItemRequest request) {
        return catalogService.update(id, request);
    }

    @PatchMapping("/{id}/deactivate")
    public CatalogItemResponse deactivate(
            @PathVariable UUID id, @RequestParam long version) {
        return catalogService.deactivate(id, version);
    }

    @PatchMapping("/{id}/activate")
    public CatalogItemResponse activate(
            @PathVariable UUID id, @RequestParam long version) {
        return catalogService.activate(id, version);
    }

    @PostMapping("/{id}/image")
    public CatalogItemResponse uploadImage(
            @PathVariable UUID id,
            @RequestParam long version,
            @RequestParam("image") MultipartFile image) {
        return catalogService.uploadImage(id, version, image);
    }
}
