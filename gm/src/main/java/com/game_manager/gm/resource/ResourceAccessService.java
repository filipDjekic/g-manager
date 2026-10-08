package com.game_manager.gm.resource;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
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

/** Current assignments to physical resources, inside the existing single-organization database. */
@Service
@RequiredArgsConstructor
public class ResourceAccessService {
    private final JdbcTemplate jdbc;
    private final PhysicalResourceRepository resources;
    private final CurrentUserProvider currentUser;
    private final AuditWriter audit;
    private final AuthorizationDenialLogger denialLogger;
    private final Clock clock;

    public record Assignment(UUID employeeId, boolean active, Long version, String employeeName, boolean employeeActive) {
        public Assignment(UUID employeeId,boolean active,Long version){this(employeeId,active,version,null,false);}
    }
    public record AssignmentRequest(@NotNull Boolean active, @Min(0) Long version) {}
    public record ManagementScope(boolean allResources, Set<UUID> resourceIds) {}

    public boolean allResources(AuthenticatedUser actor) {
        return actor.role() == Role.OWNER || actor.role() == Role.ADMIN;
    }

    public Set<UUID> assignedResources(AuthenticatedUser actor) {
        if (actor.role() != Role.EMPLOYEE) return Set.of();
        return new HashSet<>(jdbc.query("SELECT resource_id FROM user_resource_assignments "
                + "WHERE user_id=? AND active=TRUE", (row, index) -> UUID.fromString(row.getString(1)),
                actor.id().toString()));
    }

    public boolean canManage(AuthenticatedUser actor, UUID resourceId) {
        return canManage(actor, resourceId, assignedResources(actor));
    }

    public boolean canManage(AuthenticatedUser actor, UUID resourceId, Set<UUID> assignments) {
        return allResources(actor) || actor.role() == Role.EMPLOYEE
                && resourceId != null && assignments.contains(resourceId);
    }

    public void requireManage(AuthenticatedUser actor, UUID resourceId, Permission permission) {
        if (!canManage(actor, resourceId)) denied(actor, permission);
    }

    /** Lock grants until the mutation commits, serializing it with assignment revocation. */
    public void requireManageForUpdate(AuthenticatedUser actor, Collection<UUID> resourceIds, Permission permission) {
        if (allResources(actor)) return;
        if (actor.role() != Role.EMPLOYEE || resourceIds.isEmpty() || resourceIds.contains(null)) denied(actor, permission);
        Set<UUID> expected = new TreeSet<>(resourceIds);
        List<Object> parameters = new ArrayList<>();
        parameters.add(actor.id().toString());
        expected.forEach(id -> parameters.add(id.toString()));
        String placeholders = String.join(",", Collections.nCopies(expected.size(), "?"));
        Set<UUID> granted = new HashSet<>(jdbc.query("SELECT resource_id FROM user_resource_assignments "
                + "WHERE user_id=? AND active=TRUE AND resource_id IN (" + placeholders + ") "
                + "ORDER BY resource_id FOR UPDATE", (row,index) -> UUID.fromString(row.getString(1)), parameters.toArray()));
        if (!granted.containsAll(expected)) denied(actor, permission);
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public ManagementScope scope() {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        return new ManagementScope(allResources(actor), assignedResources(actor));
    }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
    public List<Assignment> list(UUID resourceId) {
        requireResource(resourceId);
        return jdbc.query("SELECT ur.user_id,ur.active,ur.version,u.name,(u.active AND u.deleted_at IS NULL) "
                + "FROM user_resource_assignments ur JOIN users u ON u.id=ur.user_id WHERE ur.resource_id=?",
                (row,index) -> new Assignment(UUID.fromString(row.getString(1)), row.getBoolean(2), row.getLong(3),row.getString(4),row.getBoolean(5)), resourceId.toString());
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
    public Assignment set(UUID resourceId, UUID employeeId, AssignmentRequest request) {
        requireResource(resourceId);
        boolean active = jdbc.query("SELECT active FROM users WHERE id=? AND role='EMPLOYEE' AND deleted_at IS NULL",
                (row,index) -> row.getBoolean(1), employeeId.toString()).stream().findFirst()
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND,"Employee not found"));
        if (request.active() && !active) throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Employee is inactive");
        var before = jdbc.query("SELECT active,version FROM user_resource_assignments WHERE resource_id=? AND user_id=? FOR UPDATE",
                (row,index) -> new Assignment(employeeId,row.getBoolean(1),row.getLong(2)),resourceId.toString(),employeeId.toString()).stream().findFirst();
        Timestamp now=Timestamp.from(clock.instant());
        long version;
        if (before.isPresent()) {
            if (!Objects.equals(request.version(),before.get().version())) conflict();
            if (jdbc.update("UPDATE user_resource_assignments SET active=?,updated_at=?,version=version+1 WHERE resource_id=? AND user_id=? AND version=?",
                    request.active(),now,resourceId.toString(),employeeId.toString(),request.version())!=1) conflict();
            version=before.get().version()+1;
        } else {
            if (request.version()!=null) conflict();
            try {
                jdbc.update("INSERT INTO user_resource_assignments(id,user_id,resource_id,active,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",
                        UUID.randomUUID().toString(),employeeId.toString(),resourceId.toString(),request.active(),now,now);
            } catch (org.springframework.dao.DuplicateKeyException ex) { conflict(); }
            version=0;
        }
        audit.write("EMPLOYEE_RESOURCE_ACCESS_CHANGED","RESOURCE",resourceId,
                before.map(value -> Map.<String,Object>of("employeeId",employeeId,"active",value.active())).orElse(null),
                Map.of("employeeId",employeeId,"active",request.active()),null,AuditVisibility.MANAGEMENT);
        return new Assignment(employeeId,request.active(),version,
                jdbc.queryForObject("SELECT name FROM users WHERE id=?",String.class,employeeId.toString()),active);
    }

    private void requireResource(UUID id) {
        if (!resources.existsById(id)) throw new ApplicationException(HttpStatus.NOT_FOUND,"Resource not found");
    }
    private void denied(AuthenticatedUser actor, Permission permission) {
        denialLogger.denied(permission,actor,"resource","unassigned-resource");
        throw new ApplicationException(HttpStatus.FORBIDDEN,"Station management is not permitted");
    }
    private static void conflict() {
        throw new ApplicationException(HttpStatus.CONFLICT,"Station assignments changed; refresh before saving");
    }
}
