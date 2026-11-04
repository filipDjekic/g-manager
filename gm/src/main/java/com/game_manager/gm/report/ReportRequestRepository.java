package com.game_manager.gm.report;
import java.time.Instant; import java.util.*; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReportRequestRepository extends JpaRepository<ReportRequest,UUID>{org.springframework.data.domain.Page<ReportRequest> findByOwnerId(UUID ownerId,org.springframework.data.domain.Pageable pageable);List<ReportRequest> findByStatusAndExpiresAtBefore(ReportStatus status,Instant now);}
