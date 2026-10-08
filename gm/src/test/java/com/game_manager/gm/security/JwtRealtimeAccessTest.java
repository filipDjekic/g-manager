package com.game_manager.gm.security;

import com.game_manager.gm.common.security.*;
import com.game_manager.gm.user.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtRealtimeAccessTest {
    @Test
    void deliveryStopsOnExpiryDeactivationDeletionOrChangedPermissions() {
        Instant now = Instant.parse("2026-10-08T10:00:00Z");
        var users = mock(UserRepository.class);
        var actor = new AuthenticatedUser(UUID.randomUUID(), "sse@example.test", Role.EMPLOYEE);
        var user = new User("SSE", actor.email(), "unused", actor.role(), true, null);
        when(users.findById(actor.id())).thenReturn(Optional.of(user));
        var access = new JwtRealtimeAccess(mock(CurrentUserProvider.class), users, Clock.fixed(now, ZoneOffset.UTC));
        var subscription = new RealtimeAccess.Subscription(actor, now.plusSeconds(30));
        assertThat(access.isValid(subscription, Permission.GAMING_SESSION_READ)).isTrue();
        assertThat(access.isValid(new RealtimeAccess.Subscription(actor, now), null)).isFalse();
        user.setActive(false);
        assertThat(access.isValid(subscription, null)).isFalse();
        user.setActive(true);
        user.setDeletedAt(now);
        assertThat(access.isValid(subscription, null)).isFalse();
        user.setDeletedAt(null);
        user.setRole(Role.CUSTOMER);
        assertThat(access.isValid(subscription, Permission.GAMING_SESSION_READ)).isFalse();
        when(users.findById(actor.id())).thenReturn(Optional.empty());
        assertThat(access.isValid(subscription, null)).isFalse();
    }
}