package com.game_manager.gm.report.dto;
import com.game_manager.gm.report.*; import java.time.Instant; import java.util.UUID;
public record ReportResponse(UUID id,String definitionKey,ReportFormat format,ReportStatus status,int progress,Long rowCount,UUID documentId,String errorMessage,Instant snapshotAt,Instant expiresAt,long version){public static ReportResponse from(ReportRequest r){return new ReportResponse(r.getId(),r.getDefinitionKey(),r.getFormat(),r.getStatus(),r.getProgress(),r.getRowCount(),r.getDocumentId(),r.getErrorMessage(),r.getSnapshotAt(),r.getExpiresAt(),r.getVersion());}}
