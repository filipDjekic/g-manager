package com.gmanager.gmanager.catalog.service;

import com.gmanager.gmanager.catalog.domain.CatalogItem;
import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import com.gmanager.gmanager.catalog.dto.CreateCatalogItemRequest;
import com.gmanager.gmanager.catalog.repository.CatalogItemRepository;
import com.gmanager.gmanager.common.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CatalogServiceTest {

    private final CatalogItemRepository catalogItemRepository = mock(CatalogItemRepository.class);
    private final CatalogService catalogService = new CatalogService(catalogItemRepository);

    @Test
    void shouldCreateProductWithoutDuration() {
        CreateCatalogItemRequest request = new CreateCatalogItemRequest(
                "Coffee",
                "Hot coffee",
                CatalogItemType.PRODUCT,
                new BigDecimal("2.50"),
                null
        );

        when(catalogItemRepository.save(any(CatalogItem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        catalogService.create(request);

        verify(catalogItemRepository).save(any(CatalogItem.class));
    }

    @Test
    void shouldRejectProductWithDuration() {
        CreateCatalogItemRequest request = new CreateCatalogItemRequest(
                "Coffee",
                "Hot coffee",
                CatalogItemType.PRODUCT,
                new BigDecimal("2.50"),
                30
        );

        assertThatThrownBy(() -> catalogService.create(request))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Product must not have duration");
    }

    @Test
    void shouldCreateServiceWithDuration() {
        CreateCatalogItemRequest request = new CreateCatalogItemRequest(
                "Haircut",
                "Basic haircut",
                CatalogItemType.SERVICE,
                new BigDecimal("15.00"),
                45
        );

        when(catalogItemRepository.save(any(CatalogItem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        catalogService.create(request);

        verify(catalogItemRepository).save(any(CatalogItem.class));
    }

    @Test
    void shouldRejectServiceWithoutDuration() {
        CreateCatalogItemRequest request = new CreateCatalogItemRequest(
                "Haircut",
                "Basic haircut",
                CatalogItemType.SERVICE,
                new BigDecimal("15.00"),
                null
        );

        assertThatThrownBy(() -> catalogService.create(request))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Service must have duration");
    }
}