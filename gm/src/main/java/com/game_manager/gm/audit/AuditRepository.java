package com.game_manager.gm.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.domain.Sort;
import java.util.List;
import java.util.UUID;

interface AuditRepository extends JpaRepository<AuditEvent, UUID>, JpaSpecificationExecutor<AuditEvent> {
    List<AuditEvent> findByResourceTypeAndResourceId(String resourceType, UUID resourceId, Sort sort);
}
