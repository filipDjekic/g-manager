package com.game_manager.gm.resource;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity @Table(name="locations") @Getter @Setter @NoArgsConstructor
public class Location extends BaseEntity {
    @Column(nullable=false,unique=true,length=40) private String code;
    @Column(nullable=false,length=120) private String name;
    @Column(nullable=false,length=255) private String address;
    @Column(length=500) private String description;
    @Column(nullable=false,length=60) private String timezone;
    @Column(nullable=false) private boolean active=true;
}
