package com.game_manager.gm.report.dto;
import java.util.List;
public record ReportDefinitionResponse(String key,String label,String metricDefinition,List<String> formats){}
