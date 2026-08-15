package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.Role;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GamingSessionLocationPolicy {
    private final JdbcTemplate jdbc;

    public void requireAccess(AuthenticatedUser actor, UUID locationId) {
        if (!canAccess(actor, locationId))
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Gaming session location is not assigned");
    }

    public boolean canAccess(AuthenticatedUser actor, UUID locationId) {
        if (actor.role() == Role.OWNER || actor.role() == Role.ADMIN) return true;
        if (actor.role() != Role.EMPLOYEE) return false;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM user_location_assignments "
                + "WHERE user_id = ? AND location_id = ? AND active = TRUE", Integer.class,
                actor.id().toString(), locationId.toString());
        return count != null && count > 0;
    }
}
