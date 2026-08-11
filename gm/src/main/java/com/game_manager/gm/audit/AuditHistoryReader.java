package com.game_manager.gm.audit;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AuditHistoryReader {
    private final AuditRepository repository;
    private final ObjectMapper objectMapper;

    public List<AuditHistoryItem> find(String resourceType, UUID resourceId) {
        return repository.findByResourceTypeAndResourceId(
                        resourceType, resourceId, Sort.by(Sort.Direction.ASC, "createdAt"))
                .stream().map(event -> new AuditHistoryItem(event.getAction(), event.getCreatedAt())).toList();
    }

    public List<AuditStatusTransitionItem> findStatusTransitions(
            String resourceType, UUID resourceId) {
        return repository.findByResourceTypeAndResourceId(
                        resourceType, resourceId, Sort.by(Sort.Direction.ASC, "createdAt"))
                .stream()
                .filter(event -> event.getBeforeData() != null && event.getAfterData() != null)
                .map(event -> new AuditStatusTransitionItem(
                        status(event.getBeforeData()), status(event.getAfterData()),
                        event.getReason(), event.getCreatedAt()))
                .filter(item -> item.fromStatus() != null && item.toStatus() != null)
                .toList();
    }

    private String status(String json) {
        try {
            var node = objectMapper.readTree(json).get("status");
            return node == null ? null : node.asText();
        } catch (RuntimeException exception) {
            return null;
        }
    }
}
