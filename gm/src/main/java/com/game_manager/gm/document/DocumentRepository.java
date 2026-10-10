package com.game_manager.gm.document;
import java.util.*; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
interface DocumentRepository extends JpaRepository<Document,UUID> {
 List<Document> findByResourceTypeAndResourceIdAndDeletedAtIsNullOrderByCreatedAtDesc(String type,UUID id);
 long countByResourceTypeAndResourceIdAndDeletedAtIsNull(String type,UUID id);
 List<Document> findByDeletedAtBefore(java.time.Instant cutoff);
 @Query("select d from Document d left join fetch d.versions where d.id=:id") Optional<Document> detail(@Param("id")UUID id);
 @Query("""
     select count(d) > 0 from Document d
     where d.id = :documentId and d.deletedAt is null
       and (
         (d.resourceType = 'CATALOG_IMAGE' and exists (
             select item.id from CatalogItem item
             where item.id = d.resourceId and item.active = true and item.deletedAt is null
               and item.imageUrl = :imageUrl))
         or (d.resourceType = 'USER_AVATAR' and exists (
             select account.id from User account
             where account.id = d.resourceId and account.active = true and account.deletedAt is null
               and account.avatarUrl = :imageUrl))
       )
     """)
 boolean isCurrentPublicImage(@Param("documentId")UUID documentId,@Param("imageUrl")String imageUrl);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select d from Document d where d.id=:id") Optional<Document> locked(@Param("id")UUID id);
}
