package com.game_manager.gm.security;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.*;
import jakarta.servlet.DispatcherType;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.features.reports.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(SecurityDispatchIntegrationTest.Config.class)
class SecurityDispatchIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    @Autowired StreamController controller;
    @Autowired FilterChainProxy security;

    @Test
    void initialStreamRequestRequiresJwtAndGamingPermission() throws Exception {
        mvc.perform(get("/api/v1/gaming-sessions/dispatch-test")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/gaming-sessions/dispatch-test").header("Authorization", bearer(Role.CUSTOMER)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(get("/error").header("Authorization", bearer(Role.OWNER))).andExpect(status().isForbidden());
    }

    @Test
    void sseCompletionRedispatchDoesNotDenyAnAlreadyCommittedResponse() throws Exception {
        var result = mvc.perform(get("/api/v1/gaming-sessions/dispatch-test")
                        .header("Authorization", bearer(Role.OWNER)))
                .andExpect(request().asyncStarted()).andReturn();
        assertThat(result.getResponse().isCommitted()).isTrue();
        controller.complete();
        mvc.perform(asyncDispatch(result)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("ready")));
    }

    @Test
    void internalErrorDispatchCanFinishWithoutWritingAnotherSecurityError() throws Exception {
        var request = new MockHttpServletRequest("GET", "/error");
        request.setDispatcherType(DispatcherType.ERROR);
        var response = new MockHttpServletResponse();
        response.setStatus(500);
        response.getWriter().write("original error");
        response.flushBuffer();
        var reached = new AtomicBoolean();
        security.doFilter(request, response, (req, res) -> reached.set(true));
        assertThat(reached).isTrue();
        assertThat(response.getContentAsString()).isEqualTo("original error");
        assertThat(response.getStatus()).isEqualTo(500);
    }

    @Test
    void disabledFeatureStillAuthenticatesBeforeReturningStandardApiError() throws Exception {
        mvc.perform(get("/api/v1/reports/definitions")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/reports/definitions").header("Authorization", bearer(Role.CUSTOMER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/reports/definitions").header("Authorization", bearer(Role.OWNER)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.requestId").exists())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND")).andExpect(jsonPath("$.fieldErrors").isArray());
        mvc.perform(options("/api/v1/notifications/stream").header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "authorization,last-event-id"))
                .andExpect(status().isOk());
    }

    @Test
    void requestSecurityContextIsRestoredForAsyncDispatchWithoutAnHttpSession() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/v1/users/me");
        request.addHeader("Authorization", bearer(Role.OWNER));
        var response = new MockHttpServletResponse();
        var principal = new java.util.concurrent.atomic.AtomicReference<Object>();
        security.doFilter(request, response, (req, res) -> principal.set(
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getPrincipal()));
        assertThat(principal.get()).isInstanceOf(com.game_manager.gm.common.security.AuthenticatedUser.class);
        assertThat(request.getSession(false)).isNull();
        request.setDispatcherType(DispatcherType.ASYNC);
        security.doFilter(request, response, (req, res) -> assertThat(
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isEqualTo(principal.get()));
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void methodSecurityAndAuthenticationFailuresReturnJsonEvenWhenClientAcceptsOnlySse() throws Exception {
        mvc.perform(get("/api/v1/notifications/dispatch-test/denied").accept(MediaType.TEXT_EVENT_STREAM)
                        .header("Authorization", bearer(Role.OWNER)))
                .andExpect(status().isForbidden()).andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(get("/api/v1/notifications/dispatch-test/unauthorized").accept(MediaType.TEXT_EVENT_STREAM)
                        .header("Authorization", bearer(Role.OWNER)))
                .andExpect(status().isUnauthorized()).andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
    private String bearer(Role role) {
        User user = new User("Dispatch", UUID.randomUUID() + "@example.test", "unused", role, true, null);
        return "Bearer " + jwt.issue(users.saveAndFlush(user).getId()).value();
    }

    @TestConfiguration
    static class Config {
        @Bean StreamController streamController() { return new StreamController(); }
    }

    @org.springframework.boot.test.context.TestComponent
    @RestController
    static class StreamController {
        SseEmitter emitter;
        public void complete() { emitter.complete(); }
        @PreAuthorize("hasAuthority('NON_EXISTING_PERMISSION')")
        @GetMapping(value = "/api/v1/notifications/dispatch-test/denied", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        public SseEmitter denied() { throw new AssertionError("Must be denied by method security"); }

        @GetMapping(value = "/api/v1/notifications/dispatch-test/unauthorized", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        public SseEmitter unauthorized() {
            throw new org.springframework.security.authentication.BadCredentialsException("private-details");
        }
        @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
        @GetMapping(value = "/api/v1/gaming-sessions/dispatch-test", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        public SseEmitter stream() throws Exception {
            emitter = new SseEmitter(60000L);
            emitter.send(SseEmitter.event().comment("ready"));
            return emitter;
        }
    }
}