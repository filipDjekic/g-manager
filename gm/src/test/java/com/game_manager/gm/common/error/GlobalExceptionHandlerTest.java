package com.game_manager.gm.common.error;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(new ApiErrorFactory());

    @Test
    void unexpectedFailuresReturnGenericResponseWithoutInternalDetails() {
        MockHttpServletRequest request = request("/api/v1/test", "request-123");

        var response = handler.handleUnexpected(
                new IllegalStateException("password=secret-token"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody())
                .isNotNull()
                .satisfies(error -> {
                    assertThat(error.message()).isEqualTo("An unexpected error occurred");
                    assertThat(error.message()).doesNotContain("secret-token");
                    assertThat(error.requestId()).isEqualTo("request-123");
                });
    }

    @Test
    void databaseConflictsAndOversizedUploadsHaveStableStatusCodes() {
        MockHttpServletRequest request = request("/api/v1/test", "request-456");

        assertThat(handler.handleDataIntegrity(
                        new DataIntegrityViolationException("constraint details"), request)
                .getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(handler.handleUploadLimit(
                        new MaxUploadSizeExceededException(5), request)
                .getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }

    private MockHttpServletRequest request(String path, String requestId) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, requestId);
        return request;
    }
}
