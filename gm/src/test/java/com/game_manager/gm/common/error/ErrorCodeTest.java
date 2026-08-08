package com.game_manager.gm.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;

class ErrorCodeTest {
    @ParameterizedTest
    @CsvSource({
            "BAD_REQUEST,MALFORMED_REQUEST",
            "UNAUTHORIZED,AUTHENTICATION_REQUIRED",
            "FORBIDDEN,ACCESS_DENIED",
            "NOT_FOUND,RESOURCE_NOT_FOUND",
            "CONFLICT,CONFLICT",
            "TOO_MANY_REQUESTS,RATE_LIMITED",
            "PAYLOAD_TOO_LARGE,PAYLOAD_TOO_LARGE",
            "UNPROCESSABLE_ENTITY,UNPROCESSABLE_REQUEST",
            "INTERNAL_SERVER_ERROR,INTERNAL_ERROR"
    })
    void mapsEveryStandardHttpCategory(HttpStatus status, ErrorCode expected) {
        assertThat(ErrorCode.from(status)).isEqualTo(expected);
    }
}
