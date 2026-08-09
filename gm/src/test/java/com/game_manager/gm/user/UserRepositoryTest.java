package com.game_manager.gm.user;

import com.game_manager.gm.common.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;
import testsupport.EntityFixtures;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class UserRepositoryTest {

    @Autowired
    private UserRepository repository;

    @Test
    void persistsAuditAndVersionAndLooksUpEmailCaseInsensitively() {
        User user = EntityFixtures.activeUser(Role.CUSTOMER, "stage.one");

        User saved = repository.saveAndFlush(user);

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getVersion()).isZero();
        assertThat(repository.findByEmailIgnoreCase("STAGE.ONE@EXAMPLE.TEST")).contains(saved);
    }
}
