package com.game_manager.gm.audit;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AuditHistoryReader {
    private final AuditRepository repository;

    public List<AuditHistoryItem> find(String resourceType, UUID resourceId) {
        return repository.findByResourceTypeAndResourceId(
                        resourceType, resourceId, Sort.by(Sort.Direction.ASC, "createdAt"))
                .stream().map(event -> new AuditHistoryItem(event.getAction(), event.getCreatedAt())).toList();
    }
}
