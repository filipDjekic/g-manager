package com.game_manager.gm.feature;

import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FeatureFlagService {
    private final FeatureFlagOverrideRepository overrides;
    private final CurrentUserProvider currentUser;
    private final AuditWriter audit;
    private final Environment environment;
    private final Clock clock;
    private final MeterRegistry metrics;

    public FeatureFlagService(FeatureFlagOverrideRepository overrides, CurrentUserProvider currentUser,
            AuditWriter audit, Environment environment, Clock clock, MeterRegistry metrics) {
        this.overrides = overrides;
        this.currentUser = currentUser;
        this.audit = audit;
        this.environment = environment;
        this.clock = clock;
        this.metrics = metrics;
    }

    @Transactional(readOnly = true)
    public List<FeatureFlagResponse> bootstrap() {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        return Arrays.stream(FeatureFlag.values()).map(flag -> response(flag, actor.id())).toList();
    }

    @Transactional(readOnly = true)
    public List<FeatureFlagResponse> definitions() {
        AuthenticatedUser actor = requireManage();
        return Arrays.stream(FeatureFlag.values()).map(flag -> response(flag, actor.id())).toList();
    }

    @Transactional(readOnly = true)
    public boolean enabled(FeatureFlag flag, UUID subject) {
        Resolution resolution = resolve(flag);
        if (!resolution.enabled()) return false;
        return subject == null ? resolution.rolloutPercentage() == 100
                : bucket(subject, flag) < resolution.rolloutPercentage();
    }

    @Transactional
    public FeatureFlagResponse update(FeatureFlag flag, UpdateFeatureFlagRequest request) {
        AuthenticatedUser actor = requireManage();
        FeatureFlagOverride value = overrides.findByFlagKey(flag.name()).orElseGet(() -> {
            FeatureFlagOverride created = new FeatureFlagOverride();
            created.setFlagKey(flag.name());
            return created;
        });
        if (value.getId() != null && request.version() != null && !value.getVersion().equals(request.version())) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Feature flag changed; refresh and retry");
        }
        Map<String, ?> before = value.getId() == null ? null : Map.of(
                "enabled", value.isEnabled(), "rolloutPercentage", value.getRolloutPercentage());
        value.setEnabled(request.enabled());
        value.setRolloutPercentage(request.rolloutPercentage());
        value.setExpiresAt(request.expiresAt());
        value.setReason(request.reason().trim());
        value.setUpdatedBy(actor.id());
        overrides.saveAndFlush(value);
        audit.write("FEATURE_FLAG_UPDATED", "FEATURE_FLAG", value.getId(), before,
                Map.of("key", flag.name(), "enabled", value.isEnabled(),
                        "rolloutPercentage", value.getRolloutPercentage()),
                value.getReason(), AuditVisibility.OWNER_ONLY);
        metrics.counter("gmanager.feature.flag.updated", "flag", flag.name()).increment();
        return response(flag, actor.id());
    }

    private FeatureFlagResponse response(FeatureFlag flag, UUID subject) {
        Resolution resolution = resolve(flag);
        return new FeatureFlagResponse(flag.name(),
                resolution.enabled() && bucket(subject, flag) < resolution.rolloutPercentage(),
                resolution.rolloutPercentage(), flag.owner(), flag.reviewBy(), resolution.overridden(),
                resolution.override() == null ? null : resolution.override().getExpiresAt(),
                resolution.override() == null ? null : resolution.override().getVersion());
    }

    private Resolution resolve(FeatureFlag flag) {
        boolean configuredDefault = environment.getProperty(
                "app.features." + flag.name().toLowerCase(Locale.ROOT).replace('_', '-') + ".enabled",
                Boolean.class, flag.defaultEnabled());
        FeatureFlagOverride override = overrides.findByFlagKey(flag.name()).orElse(null);
        if (override == null || override.getExpiresAt() != null && !override.getExpiresAt().isAfter(clock.instant())) {
            return new Resolution(configuredDefault, configuredDefault ? 100 : 0, false, null);
        }
        return new Resolution(override.isEnabled(), override.getRolloutPercentage(), true, override);
    }

    private int bucket(UUID subject, FeatureFlag flag) {
        return Math.floorMod((subject + ":" + flag.name()).hashCode(), 100);
    }

    private AuthenticatedUser requireManage() {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        if (!RolePermissions.has(actor.role(), Permission.FEATURE_FLAG_MANAGE)) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Feature flag management is not allowed");
        }
        return actor;
    }

    private record Resolution(boolean enabled, int rolloutPercentage, boolean overridden,
                              FeatureFlagOverride override) {
    }
}
