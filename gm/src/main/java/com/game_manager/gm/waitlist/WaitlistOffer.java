package com.game_manager.gm.waitlist;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "waitlist_offers")
@Getter @Setter @NoArgsConstructor
public class WaitlistOffer extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "entry_id") private WaitlistEntry entry;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "employee_id", nullable = false, length = 36) private UUID employeeId;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private WaitlistOfferStatus status;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "reservation_id", length = 36) private UUID reservationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "active_key", length = 36, unique = true) private UUID activeKey;
}
