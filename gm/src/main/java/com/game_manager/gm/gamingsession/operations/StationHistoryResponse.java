package com.game_manager.gm.gamingsession.operations;
import java.time.Instant;import java.util.List;import java.util.UUID;
public record StationHistoryResponse(Instant serverTime,UUID stationId,List<Entry> entries){public record Entry(Instant occurredAt,String category,String action,String status,Long commandSequence,String correlationId,String details){}}
