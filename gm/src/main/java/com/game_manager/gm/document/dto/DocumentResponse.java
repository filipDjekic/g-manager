package com.game_manager.gm.document.dto;
import com.game_manager.gm.document.Document; import java.time.Instant; import java.util.*;
public record DocumentResponse(UUID id,String resourceType,UUID resourceId,String displayName,boolean deleted,long version,Instant createdAt,List<DocumentVersionResponse> versions){public static DocumentResponse from(Document d){return new DocumentResponse(d.getId(),d.getResourceType(),d.getResourceId(),d.getDisplayName(),d.getDeletedAt()!=null,d.getVersion(),d.getCreatedAt(),d.getVersions().stream().map(DocumentVersionResponse::from).toList());}}
