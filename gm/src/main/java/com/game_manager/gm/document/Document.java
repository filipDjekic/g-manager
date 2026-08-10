package com.game_manager.gm.document;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.time.Instant; import java.util.*; import lombok.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="documents") @Getter @Setter @NoArgsConstructor
public class Document extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="owner_id",nullable=false,length=36) private UUID ownerId;
 @Column(name="resource_type",nullable=false,length=40) private String resourceType;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="resource_id",nullable=false,length=36) private UUID resourceId;
 @Column(name="display_name",nullable=false,length=255) private String displayName;
 @Column(name="deleted_at") private Instant deletedAt;
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="deleted_by",length=36) private UUID deletedBy;
 @OneToMany(mappedBy="document",cascade=CascadeType.ALL,orphanRemoval=true) @OrderBy("versionNumber DESC") private List<DocumentVersion> versions=new ArrayList<>();
}
