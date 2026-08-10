package com.game_manager.gm.report;
import com.game_manager.gm.common.entity.BaseEntity; import jakarta.persistence.*; import java.time.*; import java.util.UUID; import lombok.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes;
@Entity @Table(name="report_schedules") @Getter @Setter @NoArgsConstructor public class ReportSchedule extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="owner_id",nullable=false,length=36) private UUID ownerId; @Column(name="definition_key",nullable=false,length=50) private String definitionKey;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=10) private ReportFormat format; @Column(name="filters_json",nullable=false,columnDefinition="TEXT") private String filtersJson;
 @Column(nullable=false,length=50) private String timezone; @Column(name="local_time",nullable=false) private LocalTime localTime; @Column(name="day_of_week") private Integer dayOfWeek;
 @Column(nullable=false) private boolean active=true; @Column(name="next_run_at",nullable=false) private Instant nextRunAt; @Column(name="last_run_at") private Instant lastRunAt;
}
