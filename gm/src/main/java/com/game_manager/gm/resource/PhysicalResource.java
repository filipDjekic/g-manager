package com.game_manager.gm.resource;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="physical_resources") @Getter @Setter @NoArgsConstructor
public class PhysicalResource extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="area_id",nullable=false,length=36) private UUID areaId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="service_id",nullable=false,length=36) private UUID serviceId;
    @Column(nullable=false,length=40) private String code;
    @Column(nullable=false,length=120) private String name;
    @Enumerated(EnumType.STRING) @Column(name="resource_type",nullable=false,length=30) private ResourceType type;
    @Column(length=500) private String description;
    @Column(nullable=false) private boolean active=true;
    @Column(nullable=false) private boolean bookable=true;
    @Column(nullable=false) private int capacity=1;
    @Column(name="display_order",nullable=false) private int displayOrder;
    @Column(name="map_x",nullable=false) private int x;
    @Column(name="map_y",nullable=false) private int y;
    @Column(name="map_width",nullable=false) private int width=120;
    @Column(name="map_height",nullable=false) private int height=80;
    @Column(nullable=false) private int rotation;
}
