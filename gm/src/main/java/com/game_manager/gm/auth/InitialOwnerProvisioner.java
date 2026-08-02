package com.game_manager.gm.auth;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class InitialOwnerProvisioner implements ApplicationRunner {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;
    private final String name;

    public InitialOwnerProvisioner(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            GManagerProperties properties
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.email = properties.initialOwner().email().trim().toLowerCase();
        this.password = properties.initialOwner().password();
        this.name = properties.initialOwner().name();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() && password.isBlank()) {
            return;
        }
        if (email.isBlank() || password.length() < 8) {
            throw new IllegalStateException("Initial owner requires a valid email and password of at least 8 characters");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            return;
        }
        User owner = new User();
        owner.setName(name.trim());
        owner.setEmail(email);
        owner.setPasswordHash(passwordEncoder.encode(password));
        owner.setRole(Role.OWNER);
        owner.setActive(true);
        userRepository.save(owner);
    }
}
