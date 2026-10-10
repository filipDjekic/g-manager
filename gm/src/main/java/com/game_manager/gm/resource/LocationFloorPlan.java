package com.game_manager.gm.resource;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "location_floor_plans")
@Getter @Setter @NoArgsConstructor
public class LocationFloorPlan extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "location_id", nullable = false, unique = true, length = 36, updatable = false)
    private UUID locationId;

    @Column(name = "geometry_json", nullable = false, columnDefinition = "LONGTEXT")
    private String geometryJson;
}
