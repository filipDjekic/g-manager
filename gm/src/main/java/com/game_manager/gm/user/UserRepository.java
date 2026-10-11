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
    interface DisplayName {
        UUID getId();
        String getName();
        com.game_manager.gm.common.security.Role getRole();
        boolean getActive();
    }

    @Query("""
            select u.id as id, u.name as name, u.role as role, u.active as active
            from User u where u.id in :ids and u.deletedAt is null
            """)
    java.util.List<DisplayName> displayNames(@Param("ids") java.util.Collection<UUID> ids);

    interface CustomerCounts {
        long getTotal();
        long getActive();
        long getNewThisMonth();
        long getInactive();
    }

    @Query("""
            select count(u) as total,
              coalesce(sum(case when u.active = true then 1 else 0 end), 0) as active,
              coalesce(sum(case when u.createdAt >= :monthStart and u.createdAt < :monthEnd
                then 1 else 0 end), 0) as newThisMonth,
              coalesce(sum(case when u.active = false then 1 else 0 end), 0) as inactive
            from User u
            where u.role = com.game_manager.gm.common.security.Role.CUSTOMER and u.deletedAt is null
            """)
    CustomerCounts customerCounts(@Param("monthStart") java.time.Instant monthStart,
            @Param("monthEnd") java.time.Instant monthEnd);

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
    @Query("""
            select u from User u
            where u.role = com.game_manager.gm.common.security.Role.EMPLOYEE
              and u.active = true and u.deletedAt is null
            order by u.id
            """)
    java.util.List<User> findActiveEmployeesForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id and u.deletedAt is null")
    Optional<User> findByIdForUpdate(@Param("id") UUID id);
}
