package com.game_manager.gm.search;

import com.game_manager.gm.common.entity.BaseEntity;
import com.game_manager.gm.common.search.SearchResourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "search_preferences")
@Getter @Setter @NoArgsConstructor
public class SearchPreference extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "owner_id", nullable = false, length = 36, updatable = false)
    private UUID ownerId;
    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 24, updatable = false)
    private SearchResourceType resourceType;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "resource_id", nullable = false, length = 36, updatable = false)
    private UUID resourceId;
    @Column(nullable = false)
    private boolean favorite;
    @Column(name = "last_accessed_at", nullable = false)
    private Instant lastAccessedAt;

    public SearchPreference(UUID ownerId, SearchResourceType resourceType, UUID resourceId, Instant now) {
        this.ownerId = ownerId; this.resourceType = resourceType; this.resourceId = resourceId;
        this.lastAccessedAt = now;
    }
}
