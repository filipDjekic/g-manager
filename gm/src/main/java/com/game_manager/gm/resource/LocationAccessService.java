package com.game_manager.gm.resource;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.Role;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LocationAccessService {
    private final JdbcTemplate jdbc;
    private final LocationRepository locations;
    private final AuditWriter audit;
    private final Clock clock;

    public record Assignment(UUID employeeId, boolean active, Long version) {}
    public record AssignmentRequest(@NotNull Boolean active, @Min(0) Long version) {}

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
    public List<Assignment> list(UUID locationId) {
        requireLocation(locationId);
        return jdbc.query("SELECT user_id, active, version FROM user_location_assignments WHERE location_id=?",
                (row, index) -> new Assignment(UUID.fromString(row.getString("user_id")), row.getBoolean("active"), row.getLong("version")),
                locationId.toString());
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
    public Assignment set(UUID locationId, UUID employeeId, AssignmentRequest request) {
        requireLocation(locationId);
        boolean employeeActive = jdbc.query("SELECT active FROM users WHERE id=? AND role=? AND deleted_at IS NULL",
                        (row, index) -> row.getBoolean("active"), employeeId.toString(), Role.EMPLOYEE.name()).stream().findFirst()
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
        if (request.active() && !employeeActive)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Employee is inactive");
        var existing = jdbc.query("SELECT active, version FROM user_location_assignments WHERE location_id=? AND user_id=?",
                (row, index) -> new Assignment(employeeId, row.getBoolean("active"), row.getLong("version")),
                locationId.toString(), employeeId.toString()).stream().findFirst();
        Timestamp now = Timestamp.from(clock.instant());
        long nextVersion;
        if (existing.isPresent()) {
            Assignment before = existing.get();
            if (!Objects.equals(request.version(), before.version())) conflict();
            int updated = jdbc.update("UPDATE user_location_assignments SET active=?, updated_at=?, version=version+1 "
                            + "WHERE location_id=? AND user_id=? AND version=?", request.active(), now,
                    locationId.toString(), employeeId.toString(), request.version());
            if (updated != 1) conflict();
            nextVersion = before.version() + 1;
        } else {
            if (request.version() != null) conflict();
            jdbc.update("INSERT INTO user_location_assignments(id,user_id,location_id,active,created_at,updated_at,version) "
                            + "VALUES(?,?,?,?,?,?,0)", UUID.randomUUID().toString(), employeeId.toString(), locationId.toString(), request.active(), now, now);
            nextVersion = 0;
        }
        audit.write("EMPLOYEE_LOCATION_ACCESS_CHANGED", "LOCATION", locationId,
                existing.map(value -> Map.<String,Object>of("employeeId", employeeId, "active", value.active())).orElse(null),
                Map.of("employeeId", employeeId, "active", request.active()), null, AuditVisibility.MANAGEMENT);
        return new Assignment(employeeId, request.active(), nextVersion);
    }

    private void requireLocation(UUID id) {
        if (!locations.existsById(id)) throw new ApplicationException(HttpStatus.NOT_FOUND, "Location not found");
    }
    private static void conflict() {
        throw new ApplicationException(HttpStatus.CONFLICT, "Location access changed; refresh before saving");
    }
}
