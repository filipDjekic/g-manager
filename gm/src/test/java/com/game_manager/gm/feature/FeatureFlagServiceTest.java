package com.game_manager.gm.feature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.security.CurrentUserProvider;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class FeatureFlagServiceTest {
    private final FeatureFlagOverrideRepository repository = mock(FeatureFlagOverrideRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-08-10T12:00:00Z"), ZoneOffset.UTC);
    private final FeatureFlagService service = new FeatureFlagService(repository,
            mock(CurrentUserProvider.class), mock(AuditWriter.class), new MockEnvironment(), clock,
            new SimpleMeterRegistry());
    private final UUID subject = UUID.fromString("00000000-0000-0000-0000-000000000025");

    @Test
    void typedDefaultsAreSafeAndDeterministic() {
        when(repository.findByFlagKey("REPORTS")).thenReturn(Optional.empty());
        when(repository.findByFlagKey("AI_ASSISTANT")).thenReturn(Optional.empty());
        assertThat(service.enabled(FeatureFlag.REPORTS, subject)).isTrue();
        assertThat(service.enabled(FeatureFlag.AI_ASSISTANT, subject)).isFalse();
    }

    @Test
    void zeroRolloutDisablesAndExpiredOverrideFallsBackToTypedDefault() {
        FeatureFlagOverride active = override(false, 0, Instant.parse("2026-08-11T12:00:00Z"));
        when(repository.findByFlagKey("REPORTS")).thenReturn(Optional.of(active));
        assertThat(service.enabled(FeatureFlag.REPORTS, subject)).isFalse();

        FeatureFlagOverride expired = override(false, 0, Instant.parse("2026-08-09T12:00:00Z"));
        when(repository.findByFlagKey("REPORTS")).thenReturn(Optional.of(expired));
        assertThat(service.enabled(FeatureFlag.REPORTS, subject)).isTrue();
    }

    @Test
    void percentageAssignmentIsStableForSameIdentity() {
        FeatureFlagOverride partial = override(true, 50, Instant.parse("2026-08-11T12:00:00Z"));
        when(repository.findByFlagKey("WORKFLOWS")).thenReturn(Optional.of(partial));
        boolean first = service.enabled(FeatureFlag.WORKFLOWS, subject);
        assertThat(service.enabled(FeatureFlag.WORKFLOWS, subject)).isEqualTo(first);
    }

    private FeatureFlagOverride override(boolean enabled, int percentage, Instant expiresAt) {
        FeatureFlagOverride value = new FeatureFlagOverride();
        value.setFlagKey("REPORTS");
        value.setEnabled(enabled);
        value.setRolloutPercentage(percentage);
        value.setExpiresAt(expiresAt);
        return value;
    }
}
