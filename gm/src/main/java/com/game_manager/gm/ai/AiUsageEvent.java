package com.game_manager.gm.ai;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.util.UUID; import lombok.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="ai_usage_events") @Getter @Setter @NoArgsConstructor public class AiUsageEvent extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="owner_id",nullable=false,length=36) private UUID ownerId;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="report_id",nullable=false,length=36) private UUID reportId;
 @Column(nullable=false,length=40) private String provider; @Column(nullable=false,length=80) private String model;
 @Column(name="prompt_version",nullable=false,length=30) private String promptVersion; @Column(name="output_version",nullable=false,length=30) private String outputVersion;
 @Column(nullable=false,length=20) private String status; @Column(name="input_tokens",nullable=false) private int inputTokens; @Column(name="output_tokens",nullable=false) private int outputTokens;
 @Column(name="latency_ms",nullable=false) private long latencyMs; @Column(length=20) private String feedback;
}
