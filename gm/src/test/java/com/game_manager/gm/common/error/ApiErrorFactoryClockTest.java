package com.game_manager.gm.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import testsupport.TestClock;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ApiErrorFactoryClockTest {
    @Test
    void usesInjectedClockAndSafeSyntheticRequestId() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/test");

        ApiError error = new ApiErrorFactory(TestClock.fixedUtc())
                .create(HttpStatus.BAD_REQUEST, "Synthetic failure", request);

        assertThat(error.timestamp()).isEqualTo(TestClock.NOW);
        assertThat(error.requestId()).isEqualTo("unavailable");
    }
}
