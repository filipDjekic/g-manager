package com.game_manager.gm.extension;
import static org.assertj.core.api.Assertions.*;import java.util.*;import org.junit.jupiter.api.Test;
class ExtensionRegistryTest {@Test void acceptsCompileTimeExtensionsAndRejectsDuplicateIds(){ReportExtension first=extension("summary"),second=extension("summary");assertThat(new ExtensionRegistry(List.of(first),List.of()).reports()).containsExactly(first);assertThatThrownBy(()->new ExtensionRegistry(List.of(first,second),List.of())).isInstanceOf(IllegalStateException.class);}
 private ReportExtension extension(String id){return new ReportExtension(){public String id(){return id;}public String version(){return "1";}public Map<String,Object> enrich(ReadOnlyReportContext context){return Map.of();}};}}
