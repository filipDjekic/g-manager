package com.game_manager.gm.document;
import io.micrometer.core.instrument.Gauge; import io.micrometer.core.instrument.MeterRegistry; import java.time.Clock; import java.time.Duration; import org.springframework.stereotype.Component;
@Component public class DocumentObservability { public DocumentObservability(MeterRegistry r,DocumentVersionRepository v,Clock c){Gauge.builder("gmanager.document.scan.pending.age.seconds",v,x->x.oldestPending().map(i->Math.max(0,Duration.between(i,c.instant()).toSeconds())).orElse(0L)).register(r);}}
