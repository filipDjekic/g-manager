package com.game_manager.gm.ai.dto;
import java.util.List; import java.util.UUID;
public record AiReportSummaryResponse(UUID usageId,boolean aiGenerated,String summary,String limitations,List<Source> sources,String promptVersion,String outputVersion){public record Source(UUID reportId,String definition,long rowCount,String snapshotAt){}}
