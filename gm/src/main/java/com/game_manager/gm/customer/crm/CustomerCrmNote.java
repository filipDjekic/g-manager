package com.game_manager.gm.customer.crm;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.*;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="customer_crm_notes") @Getter @Setter @NoArgsConstructor
public class CustomerCrmNote extends BaseEntity {@ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="profile_id") private CustomerCrmProfile profile;@Column(nullable=false,length=1000) private String body;@JdbcTypeCode(SqlTypes.CHAR) @Column(name="created_by",nullable=false,length=36) private UUID createdBy;@Column(name="expires_at",nullable=false) private Instant expiresAt;}
