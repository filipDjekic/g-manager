package com.game_manager.gm.security;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.user.UserRepository;
import java.time.Clock;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class JwtRealtimeAccess implements RealtimeAccess {
    private final CurrentUserProvider currentUser;
    private final UserRepository users;
    private final Clock clock;

    public JwtRealtimeAccess(CurrentUserProvider currentUser, UserRepository users, Clock clock) {
        this.currentUser = currentUser;
        this.users = users;
        this.clock = clock;
    }

    @Override
    public Subscription capture(Permission permission) {
        var actor = currentUser.requireCurrentUser();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication.getDetails() instanceof Instant expiry) || !expiry.isAfter(clock.instant()))
            throw new ApplicationException(HttpStatus.UNAUTHORIZED, "Authentication is required");
        if (permission != null && !RolePermissions.has(actor.role(), permission))
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Access is denied");
        return new Subscription(actor, expiry);
    }

    @Override
    public boolean isValid(Subscription subscription, Permission permission) {
        if (!subscription.expiresAt().isAfter(clock.instant())) return false;
        return users.findById(subscription.actor().id())
                .filter(user -> user.isActive() && !user.isDeleted())
                .filter(user -> user.getRole() == subscription.actor().role())
                .filter(user -> permission == null || RolePermissions.has(user.getRole(), permission))
                .isPresent();
    }
}