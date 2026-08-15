package com.game_manager.gm.common.error;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiErrorContractIntegrationTest {
    @Autowired MockMvc mockMvc;

    @Test
    void validationErrorsAreStructuredAndDoNotEchoRejectedValues() throws Exception {
        mockMvc.perform(post("/api/v1/auth/activate")
                        .header("X-Request-Id", "validation-contract")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activationSecret\":\"\",\"password\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("X-Request-Id", "validation-contract"))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Request validation failed"))
                .andExpect(jsonPath("$.requestId").value("validation-contract"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(2)))
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'activationSecret')]").exists())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("activationSecret\":\""))));
    }

    @Test
    void malformedJsonUsesStableMachineCode() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));
    }
}
