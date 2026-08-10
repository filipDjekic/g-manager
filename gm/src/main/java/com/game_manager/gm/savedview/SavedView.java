package com.game_manager.gm.savedview;

import com.game_manager.gm.common.entity.BaseEntity;
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

import java.util.UUID;

@Entity
@Table(name = "saved_views")
@Getter
@Setter
@NoArgsConstructor
public class SavedView extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "owner_id", nullable = false, length = 36, updatable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 32, updatable = false)
    private SavedViewResourceType resourceType;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "query_json", nullable = false, columnDefinition = "TEXT")
    private String queryJson;

    public SavedView(UUID ownerId, SavedViewResourceType resourceType, String name, String queryJson) {
        this.ownerId = ownerId;
        this.resourceType = resourceType;
        this.name = name;
        this.queryJson = queryJson;
    }
}
