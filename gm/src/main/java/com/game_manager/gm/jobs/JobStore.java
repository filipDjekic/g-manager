package com.game_manager.gm.jobs;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.game_manager.gm.common.observability.SensitiveDataSanitizer;

@Repository
public class JobStore {
    private final JdbcTemplate jdbcTemplate;

    public JobStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insert(UUID id, String type, String payload, String correlationId,
                       String dedupeKey, int priority,
                       int maxAttempts, long timeoutSeconds, Instant availableAt) {
        jdbcTemplate.update("""
                INSERT INTO background_jobs
                (id, job_type, payload, correlation_id, dedupe_key, status, priority, attempts, max_attempts,
                 available_at, timeout_seconds, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, 0, ?, ?, ?, ?, ?)
                """, id.toString(), type, payload, correlationId, dedupeKey, priority, maxAttempts,
                Timestamp.from(availableAt), timeoutSeconds, Timestamp.from(availableAt),
                Timestamp.from(availableAt));
    }

    public Optional<UUID> findIdByDedupeKey(String dedupeKey) {
        List<UUID> ids = jdbcTemplate.query(
                "SELECT id FROM background_jobs WHERE dedupe_key = ?",
                (resultSet, row) -> UUID.fromString(resultSet.getString(1)), dedupeKey);
        return ids.stream().findFirst();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public List<JobRecord> claim(String workerId, int limit, Instant now, Duration lease) {
        List<JobRecord> jobs = jdbcTemplate.query("""
                SELECT id, job_type, payload, correlation_id, attempts, max_attempts, timeout_seconds,
                       lease_token, lease_expires_at
                FROM background_jobs
                WHERE (status IN ('QUEUED', 'RETRY') AND available_at <= ?)
                   OR (status IN ('RUNNING', 'CANCEL_REQUESTED') AND lease_expires_at < ?)
                ORDER BY priority DESC, created_at
                LIMIT ? FOR UPDATE SKIP LOCKED
                """, this::map, Timestamp.from(now), Timestamp.from(now), limit);
        java.util.ArrayList<JobRecord> claimed = new java.util.ArrayList<>();
        for (JobRecord job : jobs) {
            if (job.leaseToken() != null && isCancellationRequested(job.id(), job.leaseToken())) {
                cancelExpired(job, now);
            } else {
                claimed.add(claimOne(job, workerId, now, lease));
            }
        }
        return List.copyOf(claimed);
    }

    private JobRecord claimOne(JobRecord job, String workerId, Instant now, Duration lease) {
        if (job.leaseToken() != null) {
            finishAttempt(job.id(), job.leaseToken(), JobAttemptStatus.LEASE_EXPIRED, now,
                    "Worker lease expired");
        }
        UUID leaseToken = UUID.randomUUID();
        int attempt = job.attempt() + 1;
        Instant leaseExpiresAt = now.plus(lease);
        jdbcTemplate.update("""
                UPDATE background_jobs SET status='RUNNING', attempts=?, lease_owner=?,
                    lease_token=?, lease_expires_at=?, started_at=COALESCE(started_at, ?),
                    updated_at=?, last_error=NULL WHERE id=?
                """, attempt, workerId, leaseToken.toString(), Timestamp.from(leaseExpiresAt),
                Timestamp.from(now), Timestamp.from(now), job.id().toString());
        jdbcTemplate.update("""
                INSERT INTO background_job_attempts
                (id, job_id, attempt_number, worker_id, lease_token, status, started_at)
                VALUES (?, ?, ?, ?, ?, 'RUNNING', ?)
                """, UUID.randomUUID().toString(), job.id().toString(), attempt, workerId,
                leaseToken.toString(), Timestamp.from(now));
        return new JobRecord(job.id(), job.type(), job.payload(), job.correlationId(),
                attempt, job.maxAttempts(),
                job.timeoutSeconds(), leaseToken, leaseExpiresAt);
    }

    private void cancelExpired(JobRecord job, Instant now) {
        jdbcTemplate.update("""
                UPDATE background_jobs SET status='CANCELLED', completed_at=?, updated_at=?,
                    lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
                WHERE id=? AND lease_token=? AND status='CANCEL_REQUESTED'
                """, Timestamp.from(now), Timestamp.from(now), job.id().toString(),
                job.leaseToken().toString());
        finishAttempt(job.id(), job.leaseToken(), JobAttemptStatus.CANCELLED, now,
                "Cancellation recovered after worker lease expired");
    }

    public boolean heartbeat(UUID jobId, UUID leaseToken, Instant now, Duration lease) {
        return jdbcTemplate.update("""
                UPDATE background_jobs SET lease_expires_at=?, updated_at=?
                WHERE id=? AND lease_token=? AND status='RUNNING'
                """, Timestamp.from(now.plus(lease)), Timestamp.from(now), jobId.toString(),
                leaseToken.toString()) == 1;
    }

    public boolean isCancellationRequested(UUID jobId, UUID leaseToken) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM background_jobs
                WHERE id=? AND lease_token=? AND status='CANCEL_REQUESTED'
                """, Integer.class, jobId.toString(), leaseToken.toString());
        return count != null && count == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean complete(UUID jobId, UUID leaseToken, Instant now) {
        int updated = jdbcTemplate.update("""
                UPDATE background_jobs SET status='COMPLETED', completed_at=?, updated_at=?,
                    lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
                WHERE id=? AND lease_token=? AND status='RUNNING'
                """, Timestamp.from(now), Timestamp.from(now), jobId.toString(), leaseToken.toString());
        if (updated == 1) {
            finishAttempt(jobId, leaseToken, JobAttemptStatus.COMPLETED, now, null);
        }
        return updated == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean fail(JobRecord job, Instant now, Instant retryAt, String error,
                        JobAttemptStatus attemptStatus) {
        String status = job.attempt() >= job.maxAttempts() ? JobStatus.DEAD.name() : JobStatus.RETRY.name();
        int updated = jdbcTemplate.update("""
                UPDATE background_jobs SET status=?, available_at=?, updated_at=?, last_error=?,
                    completed_at=?, lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
                WHERE id=? AND lease_token=? AND status IN ('RUNNING', 'CANCEL_REQUESTED')
                """, status, Timestamp.from(retryAt), Timestamp.from(now), abbreviate(error),
                status.equals(JobStatus.DEAD.name()) ? Timestamp.from(now) : null,
                job.id().toString(), job.leaseToken().toString());
        if (updated == 1) {
            finishAttempt(job.id(), job.leaseToken(), attemptStatus, now, error);
        }
        return updated == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean cancelled(JobRecord job, Instant now) {
        int updated = jdbcTemplate.update("""
                UPDATE background_jobs SET status='CANCELLED', completed_at=?, updated_at=?,
                    lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
                WHERE id=? AND lease_token=? AND status IN ('RUNNING', 'CANCEL_REQUESTED')
                """, Timestamp.from(now), Timestamp.from(now), job.id().toString(),
                job.leaseToken().toString());
        if (updated == 1) {
            finishAttempt(job.id(), job.leaseToken(), JobAttemptStatus.CANCELLED, now, null);
        }
        return updated == 1;
    }

    public boolean requestCancellation(UUID jobId, Instant now) {
        int queued = jdbcTemplate.update("""
                UPDATE background_jobs SET status='CANCELLED', cancel_requested_at=?,
                    completed_at=?, updated_at=? WHERE id=? AND status IN ('QUEUED', 'RETRY')
                """, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now), jobId.toString());
        if (queued == 1) {
            return true;
        }
        return jdbcTemplate.update("""
                UPDATE background_jobs SET status='CANCEL_REQUESTED', cancel_requested_at=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, Timestamp.from(now), Timestamp.from(now), jobId.toString()) == 1;
    }

    public boolean retry(UUID jobId, Instant now) {
        return jdbcTemplate.update("""
                UPDATE background_jobs SET status='RETRY', attempts=0, available_at=?, updated_at=?,
                    completed_at=NULL, cancel_requested_at=NULL, last_error=NULL
                WHERE id=? AND status IN ('DEAD', 'CANCELLED')
                """, Timestamp.from(now), Timestamp.from(now), jobId.toString()) == 1;
    }

    public long count(JobStatus status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM background_jobs WHERE status=?", Long.class, status.name());
        return count == null ? 0 : count;
    }

    public long oldestQueuedAgeSeconds(Instant now) {
        Timestamp oldest = jdbcTemplate.queryForObject("""
                SELECT MIN(created_at) FROM background_jobs WHERE status IN ('QUEUED', 'RETRY')
                """, Timestamp.class);
        return oldest == null ? 0 : Math.max(0, Duration.between(oldest.toInstant(), now).toSeconds());
    }

    private void finishAttempt(UUID jobId, UUID leaseToken, JobAttemptStatus status,
                               Instant now, String error) {
        jdbcTemplate.update("""
                UPDATE background_job_attempts SET status=?, finished_at=?, error_message=?
                WHERE job_id=? AND lease_token=? AND status='RUNNING'
                """, status.name(), Timestamp.from(now), abbreviate(error), jobId.toString(),
                leaseToken.toString());
    }

    private JobRecord map(ResultSet resultSet, int rowNumber) throws SQLException {
        String token = resultSet.getString("lease_token");
        Timestamp expiry = resultSet.getTimestamp("lease_expires_at");
        return new JobRecord(UUID.fromString(resultSet.getString("id")),
                resultSet.getString("job_type"), resultSet.getString("payload"),
                resultSet.getString("correlation_id"),
                resultSet.getInt("attempts"), resultSet.getInt("max_attempts"),
                resultSet.getLong("timeout_seconds"),
                token == null ? null : UUID.fromString(token),
                expiry == null ? null : expiry.toInstant());
    }

    private static String abbreviate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String sanitized = SensitiveDataSanitizer.redact(value);
        return sanitized.length() <= 500 ? sanitized : sanitized.substring(0, 500);
    }
}
