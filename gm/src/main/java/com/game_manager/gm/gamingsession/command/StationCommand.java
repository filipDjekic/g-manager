package com.game_manager.gm.gamingsession.command;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "station_commands", uniqueConstraints =
        @UniqueConstraint(name = "uk_station_command_sequence", columnNames = {"station_id", "sequence"}))
@Getter @Setter
public class StationCommand extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "station_id", nullable = false, length = 36) private UUID stationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "session_id", nullable = false, length = 36) private UUID sessionId;
    @Column(nullable = false) private Long sequence;
    @Enumerated(EnumType.STRING) @Column(name = "command_type", nullable = false, length = 30) private StationCommandType commandType;
    @Column(name = "payload_version", nullable = false) private Integer payloadVersion;
    @Column(nullable = false, columnDefinition = "TEXT") private String payload;
    @Column(name = "correlation_id", nullable = false, length = 100) private String correlationId;
    @Column(name = "available_at", nullable = false) private Instant availableAt;
    @Column(name = "acknowledged_at") private Instant acknowledgedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
}
