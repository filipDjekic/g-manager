package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.resource.ResourceAccessService;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GamingSessionLocationPolicy {
    private final ResourceAccessService resources;
    private final JdbcTemplate jdbc;

    public void requireAccess(AuthenticatedUser actor, UUID locationId) {
        if (!resources.allResources(actor) && !assignedLocations(actor).contains(locationId))
            throw new ApplicationException(HttpStatus.FORBIDDEN,"Gaming session location is not assigned");
    }
    public void requireResourceAccess(AuthenticatedUser actor,UUID resourceId) {
        resources.requireManage(actor,resourceId,Permission.GAMING_SESSION_READ);
    }
    public void requireResourceManagement(AuthenticatedUser actor,UUID resourceId,Permission permission) {
        resources.requireManageForUpdate(actor,Collections.singletonList(resourceId),permission);
    }
    public boolean canAccessResource(AuthenticatedUser actor,UUID resourceId) {
        return resources.canManage(actor,resourceId);
    }
    public Set<UUID> assignedResources(AuthenticatedUser actor) {return resources.assignedResources(actor);}
    public Set<UUID> assignedLocations(AuthenticatedUser actor) {
        if(actor.role()!=Role.EMPLOYEE) return Set.of();
        return new HashSet<>(jdbc.query("SELECT DISTINCT a.location_id FROM user_resource_assignments ur "
                + "JOIN physical_resources r ON r.id=ur.resource_id JOIN areas a ON a.id=r.area_id "
                + "WHERE ur.user_id=? AND ur.active=TRUE",(row,index)->UUID.fromString(row.getString(1)),actor.id().toString()));
    }
}
