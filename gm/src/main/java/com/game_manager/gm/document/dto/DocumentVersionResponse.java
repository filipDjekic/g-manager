package com.game_manager.gm.document.dto;
import com.game_manager.gm.document.*; import java.time.Instant; import java.util.UUID;
public record DocumentVersionResponse(UUID id,int number,String filename,String contentType,long sizeBytes,String checksumSha256,ScanStatus scanStatus,Instant scannedAt,Instant createdAt){public static DocumentVersionResponse from(DocumentVersion v){return new DocumentVersionResponse(v.getId(),v.getVersionNumber(),v.getOriginalFilename(),v.getContentType(),v.getSizeBytes(),v.getChecksumSha256(),v.getScanStatus(),v.getScannedAt(),v.getCreatedAt());}}
