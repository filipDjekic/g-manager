package com.game_manager.gm.catalog;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "catalog_items")
@Getter
@Setter
@NoArgsConstructor
public class CatalogItem extends BaseEntity {
    @Column(nullable = false, length = 150)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ItemType type;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "deleted_by", length = 36)
    private UUID deletedBy;

    @Column(name = "deletion_reason", length = 500)
    private String deletionReason;

    public boolean isDeleted() { return deletedAt != null; }
    public void softDelete(UUID actorId, String reason, Instant now) {
        deletedAt = now; deletedBy = actorId; deletionReason = reason.trim(); active = false;
    }
    public void restore() { deletedAt = null; deletedBy = null; deletionReason = null; }
}
