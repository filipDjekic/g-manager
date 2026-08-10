package com.game_manager.gm.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {
    @org.springframework.data.jpa.repository.Query("""
            select new com.game_manager.gm.user.EmployeeAnalyticsRow(u.id, u.name)
            from User u where u.role = com.game_manager.gm.common.security.Role.EMPLOYEE
              and u.active = true and u.deletedAt is null order by u.name, u.id
            """)
    java.util.List<EmployeeAnalyticsRow> activeEmployeesForAnalytics();
    @Query("select u from User u where lower(u.email) = lower(:email) and u.deletedAt is null")
    Optional<User> findByEmailIgnoreCase(@Param("email") String email);
    boolean existsByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCaseAndDeletedAtIsNull(String email);
    boolean existsByEmailIgnoreCaseAndIdNotAndDeletedAtIsNull(String email, UUID id);

    @Override
    @Query("select u from User u where u.id = :id and u.deletedAt is null")
    Optional<User> findById(@Param("id") UUID id);

    @Query("select u from User u where u.id = :id and u.deletedAt is not null")
    Optional<User> findDeletedById(@Param("id") UUID id);
    java.util.List<User> findByRoleAndActiveTrueAndDeletedAtIsNull(com.game_manager.gm.common.security.Role role);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id and u.deletedAt is null")
    Optional<User> findByIdForUpdate(@Param("id") UUID id);
}
