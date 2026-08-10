package com.game_manager.gm.common.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app")
public record GManagerProperties(
        @NotNull ZoneId businessZone,
        @NotEmpty List<@NotBlank String> corsAllowedOrigins,
        @Valid @NotNull Storage storage,
        @Valid @NotNull Documents documents,
        @Valid @NotNull Idempotency idempotency,
        @Valid @NotNull Outbox outbox,
        @Valid @NotNull Jobs jobs,
        @Valid @NotNull Reservations reservations,
        @Valid @NotNull Notifications notifications,
        @Valid @NotNull Jwt jwt,
        @Valid @NotNull InitialOwner initialOwner
) {
    public record Storage(@NotNull Path localRoot) {
    }

    public record Documents(@Positive long maxFileBytes, @Positive int maxFilesPerResource,
            @Positive long deleteRetentionDays, @NotBlank String backend,
            String s3Endpoint, String s3Region, String s3Bucket,
            String s3AccessKey, String s3SecretKey) {
        @AssertTrue(message = "S3 document storage requires region, bucket, access key and secret key")
        public boolean isValidBackendConfiguration() {
            if (!"s3".equalsIgnoreCase(backend)) return "local".equalsIgnoreCase(backend);
            return notBlank(s3Region) && notBlank(s3Bucket) && notBlank(s3AccessKey) && notBlank(s3SecretKey);
        }

        private boolean notBlank(String value) {
            return value != null && !value.isBlank();
        }
    }

    public record Idempotency(
            @Positive long ttlHours,
            @NotBlank String cleanupCron,
            @Positive long inProgressTimeoutSeconds
    ) {
    }

    public record Outbox(
            boolean enabled,
            @Positive int batchSize,
            @Positive long pollIntervalMillis,
            @Positive long leaseSeconds,
            @Positive int maxAttempts,
            @Positive long initialBackoffSeconds,
            @Positive long retentionDays
    ) {
    }

    public record Jobs(
            boolean enabled,
            @Positive int workerCount,
            @Positive int queueCapacity,
            @Positive int claimBatchSize,
            @Positive long pollIntervalMillis,
            @Positive long leaseSeconds,
            @Positive long timeoutSeconds,
            @Positive int maxAttempts,
            @Positive long initialBackoffSeconds,
            @Positive long shutdownWaitSeconds,
            @Positive long refreshTokenRetentionDays,
            @Positive long auditRetentionDays
    ) {
    }

    public record Reservations(@Positive long cancellationCutoffMinutes) {
    }

    public record Notifications(boolean emailEnabled, @Positive int deliveryBatchSize,
            @Positive int maxDeliveryAttempts, @Positive long initialBackoffSeconds,
            @Positive long retentionDays, @Positive long sseTimeoutSeconds) {}

    public record Jwt(
            @NotBlank @Size(min = 32) String secret,
            @Positive long accessTokenMinutes,
            @Positive long refreshTokenDays,
            boolean secureCookie
    ) {
    }

    public record InitialOwner(
            @NotNull String name,
            @NotNull String email,
            @NotNull String password
    ) {
        @AssertTrue(message =
                "initial owner email and password must either both be empty or form a valid bootstrap account")
        public boolean isValidBootstrapConfiguration() {
            String normalizedEmail = email == null ? "" : email.trim();
            String normalizedPassword = password == null ? "" : password;
            String normalizedName = name == null ? "" : name.trim();
            if (normalizedEmail.isEmpty() && normalizedPassword.isEmpty()) {
                return true;
            }
            return normalizedEmail.contains("@")
                    && normalizedPassword.length() >= 8
                    && !normalizedName.isEmpty();
        }
    }
}
