package com.game_manager.gm.user;

import com.game_manager.gm.common.security.Role;
import org.springframework.data.jpa.domain.Specification;

public final class UserSpecifications {
    private UserSpecifications() {}

    public static Specification<User> hasRole(Role role) {
        return (root, query, builder) -> role == null ? null : builder.equal(root.get("role"), role);
    }

    public static Specification<User> isActive(Boolean active) {
        return (root, query, builder) -> active == null ? null : builder.equal(root.get("active"), active);
    }

    public static Specification<User> adminVisibleOnly(boolean admin) {
        return (root, query, builder) -> admin
                ? root.get("role").in(Role.EMPLOYEE)
                : null;
    }

    public static Specification<User> notDeleted() {
        return (root, query, builder) -> builder.isNull(root.get("deletedAt"));
    }

    public static Specification<User> deleted() {
        return (root, query, builder) -> builder.isNotNull(root.get("deletedAt"));
    }

    public static Specification<User> matchesSearch(String query) {
        String pattern = "%" + query.trim().toLowerCase(java.util.Locale.ROOT) + "%";
        return (root, ignored, builder) -> builder.or(
                builder.like(builder.lower(root.get("name")), pattern),
                builder.like(builder.lower(root.get("email")), pattern));
    }
}
