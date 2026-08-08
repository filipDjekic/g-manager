package com.game_manager.gm.user;

import com.game_manager.gm.common.entity.BaseEntity;
import com.game_manager.gm.common.security.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.Getter;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "users")
public class User extends BaseEntity {
    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 180)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "deleted_by", length = 36)
    private UUID deletedBy;

    @Column(name = "deletion_reason", length = 500)
    private String deletionReason;

    public User(String name, String email, String passwordHash, Role role, boolean active, String avatarUrl) {
        this.name = name; this.email = email; this.passwordHash = passwordHash;
        this.role = role; this.active = active; this.avatarUrl = avatarUrl;
    }

    public boolean isDeleted() { return deletedAt != null; }

    public void softDelete(UUID actorId, String reason, Instant now) {
        deletedAt = now; deletedBy = actorId; deletionReason = reason.trim(); active = false;
    }

    public void restore() {
        deletedAt = null; deletedBy = null; deletionReason = null;
    }
}
