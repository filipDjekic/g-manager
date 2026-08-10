package com.game_manager.gm.report;
import java.time.Instant; import java.util.*; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReportScheduleRepository extends JpaRepository<ReportSchedule,UUID>{List<ReportSchedule> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);List<ReportSchedule> findByActiveTrueAndNextRunAtLessThanEqual(Instant now);}
