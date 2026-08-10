package com.game_manager.gm.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.Filter;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PwaHttpConfigTest {
    private final PwaHttpConfig config = new PwaHttpConfig();

    @Test
    void cacheableReadGetsValidatorAndConditionalRequestReturnsNotModified() throws Exception {
        Filter filter = config.pwaEtagFilter().getFilter();
        MockHttpServletRequest first = new MockHttpServletRequest("GET", "/api/v1/catalog");
        MockHttpServletResponse firstResponse = new MockHttpServletResponse();
        filter.doFilter(first, firstResponse, (request, response) ->
                response.getOutputStream().write("catalog-v1".getBytes(StandardCharsets.UTF_8)));
        String etag = firstResponse.getHeader("ETag");
        assertThat(etag).isNotBlank();

        MockHttpServletRequest conditional = new MockHttpServletRequest("GET", "/api/v1/catalog");
        conditional.addHeader("If-None-Match", etag);
        MockHttpServletResponse conditionalResponse = new MockHttpServletResponse();
        filter.doFilter(conditional, conditionalResponse, (request, response) ->
                response.getOutputStream().write("catalog-v1".getBytes(StandardCharsets.UTF_8)));
        assertThat(conditionalResponse.getStatus()).isEqualTo(304);
    }

    @Test
    void apiMetadataPreventsUncontrolledSharedCaching() throws Exception {
        Filter filter = config.apiMetadataFilter().getFilter();
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/catalog"), response,
                (request, result) -> { });
        assertThat(response.getHeader("X-API-Version")).isEqualTo("1");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("private, no-store");
    }
}
