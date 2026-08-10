package com.game_manager.gm.report;
import java.time.Instant; import java.util.*; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReportRequestRepository extends JpaRepository<ReportRequest,UUID>{List<ReportRequest> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);List<ReportRequest> findByStatusAndExpiresAtBefore(ReportStatus status,Instant now);}
