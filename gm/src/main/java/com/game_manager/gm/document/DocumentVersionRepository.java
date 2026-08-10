package com.game_manager.gm.document;
import java.time.Instant; import java.util.*; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
interface DocumentVersionRepository extends JpaRepository<DocumentVersion,UUID> {
 Optional<DocumentVersion> findByIdAndDocumentId(UUID id,UUID documentId);
 @Query("select min(v.createdAt) from DocumentVersion v where v.scanStatus='PENDING'") Optional<Instant> oldestPending();
 List<DocumentVersion> findByScanStatus(ScanStatus status);
}
