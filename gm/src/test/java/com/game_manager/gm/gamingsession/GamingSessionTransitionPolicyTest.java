package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.*;
import com.game_manager.gm.common.config.GamingSessionProperties;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GamingSessionTransitionPolicyTest {
    private final GamingSessionTransitionPolicy policy = new GamingSessionTransitionPolicy(
            new GamingSessionProperties(15, 120, 480, 120, 10, 60, List.of(15, 5, 1)));

    @Test void validatesStartAndExtensionBoundsWithoutCreatingAnotherSession() {
        assertThat(policy.startDuration(null).toMinutes()).isEqualTo(120);
        assertThatThrownBy(() -> policy.startDuration(10)).isInstanceOf(RuntimeException.class);
        GamingSession session = new GamingSession(); session.setStatus(GamingSessionStatus.ACTIVE);
        session.setStartedAt(Instant.parse("2026-08-15T10:00:00Z"));
        session.setEndsAt(Instant.parse("2026-08-15T12:00:00Z"));
        assertThat(policy.extendedEnd(session, 30)).isEqualTo(Instant.parse("2026-08-15T12:30:00Z"));
        session.setEndsAt(Instant.parse("2026-08-15T17:50:00Z"));
        assertThatThrownBy(() -> policy.extendedEnd(session, 30)).isInstanceOf(RuntimeException.class);
    }

    @Test void terminalSessionCannotTransitionAgain() {
        GamingSession session = new GamingSession(); session.setStatus(GamingSessionStatus.TERMINATED);
        assertThatThrownBy(() -> policy.requireActive(session)).isInstanceOf(RuntimeException.class);
    }
}
