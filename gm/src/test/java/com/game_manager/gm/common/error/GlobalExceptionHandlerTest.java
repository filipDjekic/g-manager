package com.game_manager.gm.common.error;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(new ApiErrorFactory(java.time.Clock.systemUTC()));

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

    @Test
    void diagnosticsKeepAllFramesAndCausesWithoutCredentialMessages() {
        var cause = new NullPointerException("Bearer private-token");
        var exception = new IllegalStateException("password=private-password", cause);
        exception.addSuppressed(new RuntimeException("Cookie=private-cookie"));
        String stack = GlobalExceptionHandler.diagnosticStack(exception);
        assertThat(stack).contains("java.lang.IllegalStateException", "Caused by: java.lang.NullPointerException",
                "Suppressed: java.lang.RuntimeException", "GlobalExceptionHandlerTest.java:");
        assertThat(stack).doesNotContain("private-token", "private-password", "private-cookie");
    }

    @Test
    void securityFailuresDistinguishMissingAuthenticationFromInsufficientPermission() {
        var request = request("/api/v1/test", "security-request");
        try {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
            assertThat(handler.handleAccessDenied(new org.springframework.security.access.AccessDeniedException("denied"), request)
                    .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                            "user", null, java.util.List.of()));
            assertThat(handler.handleAccessDenied(new org.springframework.security.access.AccessDeniedException("denied"), request)
                    .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(handler.handleAuthentication(new org.springframework.security.authentication.BadCredentialsException("private"), request)
                    .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        } finally { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }
    }

    @Test
    void committedResponsesAreHandledWithoutOverwritingSseOrMaskingUncommittedFailures() throws Exception {
        var resolver = new CommittedResponseExceptionResolver();
        var request = request("/api/v1/notifications/stream", "committed-request");
        var response = new org.springframework.mock.web.MockHttpServletResponse();
        assertThat(resolver.resolveException(request, response, null, new NullPointerException())).isNull();
        response.setContentType("text/event-stream");
        response.getWriter().write("event: heartbeat\n\n");
        response.flushBuffer();
        assertThat(resolver.resolveException(request, response, null, new NullPointerException())).isNotNull();
        assertThat(response.getContentAsString()).isEqualTo("event: heartbeat\n\n");
        assertThat(response.getContentType()).startsWith("text/event-stream");
    }
    private MockHttpServletRequest request(String path, String requestId) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, requestId);
        return request;
    }
}
