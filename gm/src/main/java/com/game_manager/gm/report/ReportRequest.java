package com.game_manager.gm.report;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.time.Instant; import java.util.UUID; import lombok.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="report_requests") @Getter @Setter @NoArgsConstructor public class ReportRequest extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="owner_id",nullable=false,length=36) private UUID ownerId;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="job_id",length=36) private UUID jobId;
 @Column(name="definition_key",nullable=false,length=50) private String definitionKey;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=10) private ReportFormat format;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private ReportStatus status;
 @Column(name="filters_json",nullable=false,columnDefinition="TEXT") private String filtersJson;
 @Column(name="permission_snapshot",nullable=false,length=1000) private String permissionSnapshot;
 @Column(nullable=false,length=50) private String timezone; @Column(nullable=false,length=20) private String locale;
 @Column(name="snapshot_at",nullable=false) private Instant snapshotAt; @Column(nullable=false) private int progress;
 @Column(name="row_count") private Long rowCount; @JdbcTypeCode(SqlTypes.CHAR) @Column(name="document_id",length=36) private UUID documentId;
 @Column(name="error_message",length=500) private String errorMessage; @Column(name="expires_at") private Instant expiresAt;
}
