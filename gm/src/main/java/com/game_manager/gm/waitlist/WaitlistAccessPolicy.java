package com.game_manager.gm.waitlist;

import com.game_manager.gm.common.security.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.resource.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
class WaitlistAccessPolicy {
    private final ResourceAccessService access;
    private final NamedParameterJdbcTemplate jdbc;

    // Flexible preferences must stay wholly inside the employee's assigned scope.
    // A location grant alone never grants access to an unassigned physical resource.
    static final String SCOPE = """
        (:allResources=true OR (
          (w.resource_id IS NOT NULL AND EXISTS(SELECT 1 FROM user_resource_assignments ua
              WHERE ua.user_id=:actor AND ua.active=true AND ua.resource_id=w.resource_id))
          OR (w.resource_id IS NULL AND w.employee_id=:actor AND w.location_id IS NOT NULL
            AND EXISTS(SELECT 1 FROM user_location_assignments la
                WHERE la.user_id=:actor AND la.active=true AND la.location_id=w.location_id)
            AND NOT EXISTS(SELECT 1 FROM physical_resources candidate JOIN areas ca ON ca.id=candidate.area_id
                WHERE candidate.service_id=w.service_id AND ca.location_id=w.location_id
                  AND (w.area_id IS NULL OR candidate.area_id=w.area_id)
                  AND NOT EXISTS(SELECT 1 FROM user_resource_assignments ua
                      WHERE ua.user_id=:actor AND ua.active=true AND ua.resource_id=candidate.id)))
        ))
        """;

    MapSqlParameterSource parameters(AuthenticatedUser actor) {
        return new MapSqlParameterSource("actor",actor.id().toString()).addValue("allResources",access.allResources(actor));
    }
    boolean canRead(AuthenticatedUser actor, UUID id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM waitlist_entries w WHERE w.id=:id AND "+SCOPE,
                parameters(actor).addValue("id",id.toString()),Long.class)>0;
    }
    public record Scope(boolean allResources, Set<UUID> resourceIds, List<String> locationIds) {}
    Scope scope(AuthenticatedUser actor) {
        return new Scope(access.allResources(actor),access.assignedResources(actor),
            jdbc.queryForList("SELECT location_id FROM user_location_assignments WHERE user_id=:actor AND active=true",
                parameters(actor),String.class));
    }
    void requireRead(AuthenticatedUser actor, UUID id) {
        if(!canRead(actor,id))throw new ApplicationException(HttpStatus.NOT_FOUND,"Waitlist entry not found");
    }
    void requireUpdate(AuthenticatedUser actor, UUID employee, UUID service, UUID location, UUID area, UUID resource) {
        if(access.allResources(actor))return;
        if(resource!=null) { access.requireManageForUpdate(actor,List.of(resource),Permission.WAITLIST_MANAGE); return; }
        if(actor.role()!=Role.EMPLOYEE||!actor.id().equals(employee)||location==null)denied();
        var grant=jdbc.queryForList("SELECT id FROM user_location_assignments WHERE user_id=:actor AND location_id=:location "
                + "AND active=true FOR UPDATE",parameters(actor).addValue("location",location.toString()));
        if(grant.isEmpty())denied();
        // Scope remains checkable for cancellation even when an area/service becomes inactive.
        var ids=jdbc.queryForList("""
            SELECT r.id FROM physical_resources r JOIN areas a ON a.id=r.area_id
            WHERE r.service_id=:service AND a.location_id=:location AND (:area IS NULL OR r.area_id=:area)
            """,parameters(actor).addValue("service",service.toString()).addValue("location",location.toString())
                .addValue("area",area==null?null:area.toString()),String.class).stream().map(UUID::fromString).toList();
        if(!ids.isEmpty())access.requireManageForUpdate(actor,ids,Permission.WAITLIST_MANAGE);
    }
    private static void denied() { throw new ApplicationException(HttpStatus.FORBIDDEN,"Waitlist management is outside your assigned scope"); }
}
