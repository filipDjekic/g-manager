package com.game_manager.gm.user;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.dto.UserResponse;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only projections over the existing employee, assignment and time-off models. */
@Service
@RequiredArgsConstructor
public class EmployeeOverviewService {
    private final UserRepository users;
    private final CurrentUserProvider currentUser;
    private final GManagerProperties properties;
    private final Clock clock;
    private final JdbcTemplate jdbc;

    public record Statistics(long total, long active, long newThisMonth, long inactive,
            Long onLeave, LocalDate businessDate, String businessZone) {}
    public record AssignedLocation(UUID id, String name, String code, boolean active, long version) {}
    public record AssignedResource(UUID id, String name, String code, String type, UUID areaId,
            String areaName, UUID locationId, String locationName, boolean active, long version) {}
    public record Assignments(List<AssignedLocation> locations, List<AssignedResource> resources) {}
    public record Leave(UUID id, Instant startsAt, Instant endsAt, String status) {}

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_LIST')")
    public Statistics statistics() {
        requireManagement();
        var today = LocalDate.now(clock.withZone(properties.businessZone()));
        var month = today.withDayOfMonth(1);
        var counts = users.employeeCounts(month.atStartOfDay(properties.businessZone()).toInstant(),
                month.plusMonths(1).atStartOfDay(properties.businessZone()).toInstant());
        Long onLeave = null;
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean canReadLeave = authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> Permission.WORKING_HOURS_MANAGE.name().equals(authority.getAuthority()));
        if (canReadLeave) {
            onLeave = jdbc.queryForObject("""
                    SELECT COUNT(DISTINCT t.employee_id)
                    FROM employee_time_off t JOIN users u ON u.id=t.employee_id
                    WHERE u.role='EMPLOYEE' AND u.deleted_at IS NULL AND t.status='APPROVED'
                      AND t.starts_at < ? AND t.ends_at > ?
                    """, Long.class,
                    Timestamp.from(today.plusDays(1).atStartOfDay(properties.businessZone()).toInstant()),
                    Timestamp.from(today.atStartOfDay(properties.businessZone()).toInstant()));
        }
        return new Statistics(counts.getTotal(), counts.getActive(), counts.getNewThisMonth(),
                counts.getInactive(), onLeave, today, properties.businessZone().getId());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_LIST')")
    public UserResponse employee(UUID id) {
        return UserResponse.from(requireEmployee(id));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_LIST') and hasAuthority('RESOURCE_MANAGE')")
    public Assignments assignments(UUID id) {
        requireEmployee(id);
        var locations = jdbc.query("""
                SELECT l.id,l.name,l.code,l.active,ul.version
                FROM user_location_assignments ul JOIN locations l ON l.id=ul.location_id
                WHERE ul.user_id=? AND ul.active=TRUE ORDER BY l.name,l.id
                """, (row, index) -> new AssignedLocation(UUID.fromString(row.getString(1)),
                        row.getString(2), row.getString(3), row.getBoolean(4), row.getLong(5)), id.toString());
        var resources = jdbc.query("""
                SELECT r.id,r.name,r.code,r.resource_type,a.id,a.name,l.id,l.name,
                       (r.active AND a.active AND l.active),ur.version
                FROM user_resource_assignments ur
                JOIN physical_resources r ON r.id=ur.resource_id
                JOIN areas a ON a.id=r.area_id JOIN locations l ON l.id=a.location_id
                WHERE ur.user_id=? AND ur.active=TRUE ORDER BY l.name,a.name,r.name,r.id
                """, (row, index) -> new AssignedResource(UUID.fromString(row.getString(1)),
                        row.getString(2), row.getString(3), row.getString(4),
                        UUID.fromString(row.getString(5)), row.getString(6), UUID.fromString(row.getString(7)),
                        row.getString(8), row.getBoolean(9), row.getLong(10)), id.toString());
        return new Assignments(locations, resources);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_LIST') and hasAuthority('WORKING_HOURS_MANAGE')")
    public com.game_manager.gm.common.dto.PageResponse<Leave> leavePage(UUID id,int page,int size) {
        requireEmployee(id);
        var today=LocalDate.now(clock.withZone(properties.businessZone()));
        return com.game_manager.gm.common.dto.SqlPages.query(jdbc,
            "SELECT id,starts_at,ends_at,status FROM employee_time_off WHERE employee_id=? AND status='APPROVED' AND ends_at>?",
            "starts_at,id",(row,index)->new Leave(UUID.fromString(row.getString(1)),row.getTimestamp(2).toInstant(),row.getTimestamp(3).toInstant(),row.getString(4)),
            page,size,id.toString(),Timestamp.from(today.atStartOfDay(properties.businessZone()).toInstant()));
    }

    private User requireEmployee(UUID id) {
        requireManagement();
        return users.findById(id).filter(user -> user.getRole() == Role.EMPLOYEE)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
    }

    private void requireManagement() {
        var role = currentUser.requireCurrentUser().role();
        if (role != Role.ADMIN && role != Role.OWNER)
            throw new ApplicationException(HttpStatus.FORBIDDEN, "User management is not permitted");
    }
}
