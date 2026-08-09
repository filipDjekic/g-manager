package testsupport;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;

public final class EntityFixtures {
    private EntityFixtures() {
    }

    public static User activeUser(Role role, String discriminator) {
        User user = new User();
        user.setName(role + " Fixture");
        user.setEmail(discriminator + "@example.test");
        user.setPasswordHash("synthetic-test-hash");
        user.setRole(role);
        user.setActive(true);
        return user;
    }
}
