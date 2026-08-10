package com.game_manager.gm.document;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.time.Instant; import java.util.UUID; import lombok.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="document_versions",uniqueConstraints=@UniqueConstraint(name="uk_document_version",columnNames={"document_id","version_number"})) @Getter @Setter @NoArgsConstructor
public class DocumentVersion extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="document_id") private Document document;
 @Column(name="version_number",nullable=false) private int versionNumber;
 @Column(name="object_key",nullable=false,length=500) private String objectKey;
 @Column(name="original_filename",nullable=false,length=255) private String originalFilename;
 @Column(name="content_type",nullable=false,length=100) private String contentType;
 @Column(name="size_bytes",nullable=false) private long sizeBytes;
 @Column(name="checksum_sha256",nullable=false,length=64) private String checksumSha256;
 @Enumerated(EnumType.STRING) @Column(name="scan_status",nullable=false,length=20) private ScanStatus scanStatus;
 @Column(name="scan_detail",length=255) private String scanDetail; @Column(name="scanned_at") private Instant scannedAt;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="created_by",nullable=false,length=36) private UUID createdBy;
}
