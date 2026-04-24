package com.gmanager.gmanager_backend.organization;

import com.gmanager.gmanager_backend.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {
    Optional<Organization> findByOwner(User owner);
    boolean existsByOwner(User owner);
}
