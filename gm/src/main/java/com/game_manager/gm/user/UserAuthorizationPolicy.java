package com.game_manager.gm.user;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserAuthorizationPolicy {
    private final AuthorizationDenialLogger denialLogger;

    public void requireCreatableRole(AuthenticatedUser actor, Role targetRole) {
        boolean permitted = actor.role() == Role.OWNER
                ? targetRole == Role.ADMIN || targetRole == Role.EMPLOYEE
                : actor.role() == Role.ADMIN && targetRole == Role.EMPLOYEE;
        if (!permitted) deny(Permission.USER_CREATE, actor, "role-escalation");
    }

    public void requireDeactivation(AuthenticatedUser actor, User target) {
        if (actor.id().equals(target.getId())) {
            throw new ApplicationException(HttpStatus.CONFLICT,
                    "You cannot deactivate your own account");
        }
        boolean permitted = actor.role() == Role.OWNER
                ? target.getRole() != Role.OWNER
                : actor.role() == Role.ADMIN && target.getRole() == Role.EMPLOYEE;
        if (!permitted) deny(Permission.USER_DEACTIVATE, actor,
                target.getRole() == Role.OWNER ? "protected-owner" : "role-escalation");
    }

    private void deny(Permission permission, AuthenticatedUser actor, String relation) {
        denialLogger.denied(permission, actor, "user", relation);
        throw new ApplicationException(HttpStatus.FORBIDDEN,
                permission == Permission.USER_CREATE
                        ? "The requested role cannot be created"
                        : "The requested user cannot be deactivated");
    }
}
