package com.game_manager.gm.resource;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="areas") @Getter @Setter @NoArgsConstructor
public class Area extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="location_id",nullable=false,length=36) private UUID locationId;
    @Column(nullable=false,length=40) private String code;
    @Column(nullable=false,length=120) private String name;
    @Column(length=500) private String description;
    @Column(nullable=false) private boolean active=true;
    @Column(name="display_order",nullable=false) private int displayOrder;
    @Column(name="map_width",nullable=false) private int mapWidth=1000;
    @Column(name="map_height",nullable=false) private int mapHeight=600;
}
