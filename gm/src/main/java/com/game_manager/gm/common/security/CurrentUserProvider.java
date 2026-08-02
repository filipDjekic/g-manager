package com.game_manager.gm.common.security;

public interface CurrentUserProvider {
    AuthenticatedUser requireCurrentUser();
}
