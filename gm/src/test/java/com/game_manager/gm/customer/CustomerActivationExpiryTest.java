package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.SecurityEventPort;
import com.game_manager.gm.common.security.SessionRevocationPort;
import com.game_manager.gm.events.OutboxWriter;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class CustomerActivationExpiryTest {
    private static final Instant NOW = Instant.parse("2026-11-01T10:00:00Z");
    @Mock UserRepository users;
    @Mock CustomerActivationTokenRepository tokens;
    @Mock CurrentUserProvider currentUser;
    @Mock PasswordEncoder passwords;
    @Mock SessionRevocationPort sessions;
    @Mock AuditWriter audit;
    @Mock OutboxWriter outbox;
    @Mock CustomerActivationCodeGenerator codes;
    @Mock CustomerActivationHash hashes;
    @Mock SecurityEventPort securityEvents;
    @Mock Clock clock;
    @InjectMocks CustomerAccountService service;
    private CustomerActivationToken token;

    @BeforeEach
    void setup() {
        User user = new User();
        user.setId(UUID.randomUUID()); user.setRole(Role.CUSTOMER); user.setMustChangePassword(true);
        when(users.findByEmailForUpdate("customer@example.test")).thenReturn(Optional.of(user));
        when(hashes.hash("code", "A7K2")).thenReturn("hash");
        token = new CustomerActivationToken(); token.setUserId(user.getId());
        when(tokens.findByHashForUpdate("hash")).thenReturn(Optional.of(token));
        when(clock.instant()).thenReturn(NOW);
    }

    @Test
    void rejectsAtTheExactExpirationInstant() {
        token.setExpiresAt(NOW);
        assertInvalid();
        verifyNoInteractions(passwords, securityEvents, outbox);
    }

    @Test
    void expiryDuringPasswordHashingCannotActivateTheAccount() {
        token.setExpiresAt(NOW.plusSeconds(1));
        when(clock.instant()).thenReturn(NOW, NOW.plusSeconds(2));
        when(passwords.encode(anyString())).thenReturn("password-hash");
        assertInvalid();
        verify(tokens, never()).consumeActiveForUser(any(), any());
        verify(users, never()).save(any());
        verifyNoInteractions(securityEvents, outbox);
    }

    private void assertInvalid() {
        assertThatThrownBy(() -> service.activate("customer@example.test", "A7K2", "CustomerPass1!", "ip-hash"))
                .isInstanceOf(ApplicationException.class).hasMessage("Activation code is invalid or expired");
    }
}
