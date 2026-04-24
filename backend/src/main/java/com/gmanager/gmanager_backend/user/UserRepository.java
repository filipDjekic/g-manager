package com.gmanager.gmanager_backend.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByEmailAndIdNot(String email, Long id);

    List<User> findAllByRoleIn(Collection<Role> roles);

    List<User> findAllByOrganizationIdAndRoleIn(Long organizationId, Collection<Role> roles);
}
