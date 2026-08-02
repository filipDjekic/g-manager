package com.game_manager.gm.user;

import com.game_manager.gm.common.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class UserRepositoryTest {

    @Autowired
    private UserRepository repository;

    @Test
    void persistsAuditAndVersionAndLooksUpEmailCaseInsensitively() {
        User user = new User();
        user.setName("Stage One");
        user.setEmail("stage.one@example.com");
        user.setPasswordHash("not-a-real-password-hash");
        user.setRole(Role.CUSTOMER);
        user.setActive(true);

        User saved = repository.saveAndFlush(user);

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getVersion()).isZero();
        assertThat(repository.findByEmailIgnoreCase("STAGE.ONE@EXAMPLE.COM")).contains(saved);
    }
}
