package com.game_manager.gm.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    List<User> findByName(String name);
    List<User> findByEmail(String email);
    List<User> findByRole(Role role);
}
