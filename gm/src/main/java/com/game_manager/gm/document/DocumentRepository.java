package com.game_manager.gm.document;
import java.util.*; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
interface DocumentRepository extends JpaRepository<Document,UUID> {
 List<Document> findByResourceTypeAndResourceIdAndDeletedAtIsNullOrderByCreatedAtDesc(String type,UUID id);
 long countByResourceTypeAndResourceIdAndDeletedAtIsNull(String type,UUID id);
 List<Document> findByDeletedAtBefore(java.time.Instant cutoff);
 @Query("select d from Document d left join fetch d.versions where d.id=:id") Optional<Document> detail(@Param("id")UUID id);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select d from Document d where d.id=:id") Optional<Document> locked(@Param("id")UUID id);
}
