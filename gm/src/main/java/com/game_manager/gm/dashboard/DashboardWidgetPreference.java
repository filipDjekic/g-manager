package com.game_manager.gm.dashboard;
import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity
@Table(name = "dashboard_widget_preferences", uniqueConstraints =
        @UniqueConstraint(name = "uk_dashboard_widget_owner_key", columnNames = {"owner_id", "widget_key"}))
@Getter @Setter @NoArgsConstructor
public class DashboardWidgetPreference extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "owner_id", nullable = false, length = 36) private UUID ownerId;
    @Column(name = "widget_key", nullable = false, length = 50) private String widgetKey;
    @Column(name = "widget_position", nullable = false) private int position;
    @Column(nullable = false) private boolean visible;
    @Column(precision = 12, scale = 2) private BigDecimal threshold;
}
