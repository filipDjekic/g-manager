package com.game_manager.gm.station;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "application_profile_entries")
@Getter @Setter
public class ApplicationProfileEntry extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "profile_id", nullable = false, length = 36) private UUID profileId;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "application_definition_id", nullable = false, length = 36)
    private UUID applicationDefinitionId;
    @Column(name = "required_process", nullable = false) private boolean requiredProcess;
    @Column(name = "auto_start", nullable = false) private boolean autoStart;
    @Column(name = "launch_order", nullable = false) private int launchOrder;
    @Column(name = "arguments_override", length = 1000) private String argumentsOverride;
}
