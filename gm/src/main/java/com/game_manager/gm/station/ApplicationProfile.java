package com.game_manager.gm.station;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "application_profiles")
@Getter @Setter
public class ApplicationProfile extends BaseEntity {
    @Column(nullable = false, unique = true, length = 60) private String code;
    @Column(nullable = false, length = 120) private String name;
    @Column(length = 500) private String description;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "configuration_version", nullable = false) private long configurationVersion = 1;
}
