package com.game_manager.gm.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.game_manager.gm.common.error.ApplicationException;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PageRequestFactoryTest {
    private final PageRequestFactory factory = new PageRequestFactory();

    @Test
    void createsBoundedAllowListedPageRequest() {
        var request = factory.create(2, 1000, "createdAt", "desc", Set.of("createdAt"));

        assertThat(request.getPageNumber()).isEqualTo(2);
        assertThat(request.getPageSize()).isEqualTo(100);
        assertThat(request.getSort().getOrderFor("createdAt")).isNotNull()
                .extracting(order -> order.getDirection().name()).isEqualTo("DESC");
    }

    @Test
    void rejectsUnknownPropertiesAndDirectionsBeforeRepositoryAccess() {
        assertThatThrownBy(() -> factory.create(0, 20, "passwordHash", "ASC", Set.of("name")))
                .isInstanceOf(ApplicationException.class)
                .hasMessage("Unsupported sort field");
        assertThatThrownBy(() -> factory.create(0, 20, "name", "sideways", Set.of("name")))
                .isInstanceOf(ApplicationException.class)
                .hasMessage("Unsupported sort direction");
    }

    @Test
    void createsAllowListedMultiSortAndRejectsShapeMismatch() {
        var request = factory.create(0, 20, "status,createdAt", "ASC,DESC", Set.of("status", "createdAt"));
        assertThat(request.getSort().getOrderFor("status").getDirection()).isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
        assertThat(request.getSort().getOrderFor("createdAt").getDirection()).isEqualTo(org.springframework.data.domain.Sort.Direction.DESC);
        assertThatThrownBy(() -> factory.create(0, 20, "status,createdAt", "ASC,DESC,ASC", Set.of("status", "createdAt")))
                .isInstanceOf(ApplicationException.class).hasMessage("Sort directions must match sort fields");
    }
}
