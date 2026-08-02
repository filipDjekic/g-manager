package com.game_manager.gm.security;

import com.game_manager.gm.common.error.ApplicationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUserProvider {
    public AuthenticatedUser requireCurrentUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof AuthenticatedUser user) {
            return user;
        }
        throw new ApplicationException(HttpStatus.UNAUTHORIZED, "Authentication is required");
    }
}
