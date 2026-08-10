package com.game_manager.gm.extension;
import java.util.Map;
public interface ReportExtension { String id(); String version(); Map<String,Object> enrich(ReadOnlyReportContext context); record ReadOnlyReportContext(String definition,long rowCount){} }
