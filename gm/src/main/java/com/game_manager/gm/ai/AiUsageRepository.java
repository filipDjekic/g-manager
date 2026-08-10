package com.game_manager.gm.ai;
import java.time.Instant; import java.util.UUID; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
interface AiUsageRepository extends JpaRepository<AiUsageEvent,UUID> { @Query("select coalesce(sum(a.inputTokens+a.outputTokens),0) from AiUsageEvent a where a.ownerId=:owner and a.createdAt>=:since") long tokensSince(@Param("owner") UUID owner,@Param("since") Instant since); long deleteByCreatedAtBefore(Instant cutoff); }
