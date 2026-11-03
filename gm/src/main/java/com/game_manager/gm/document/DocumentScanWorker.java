package com.game_manager.gm.document;

import com.game_manager.gm.document.storage.DocumentStorage;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.ArrayList;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(prefix="app.jobs",name="enabled",havingValue="true")
public class DocumentScanWorker {
    private final DocumentVersionRepository versions;private final DocumentStorage storage;
    private final DocumentScanner scanner;private final Clock clock;private final MeterRegistry metrics;
    public DocumentScanWorker(DocumentVersionRepository v,DocumentStorage s,DocumentScanner scanner,Clock clock,MeterRegistry metrics){
        versions=v;storage=s;this.scanner=scanner;this.clock=clock;this.metrics=metrics;
    }
    @Scheduled(fixedDelayString="${app.documents.scan-interval-millis:2000}")
    @Transactional public void scanPending(){
        var batch=new ArrayList<>(versions.findTop50ByScanStatusOrderByCreatedAtAsc(ScanStatus.PENDING));
        // Retry transport outages after a minute. Integrity errors and rejected content remain quarantined.
        batch.addAll(versions.findTop50ByScanStatusAndScanDetailAndScannedAtBeforeOrderByScannedAtAsc(
            ScanStatus.ERROR,"Scanner unavailable",clock.instant().minusSeconds(60)));
        for(DocumentVersion v:batch){
            try(var in=storage.open(v.getObjectKey())){
                var result=scanner.scan(in,v.getContentType());
                v.setScanStatus(result.clean()?ScanStatus.CLEAN:ScanStatus.REJECTED);
                v.setScanDetail(result.detail());v.setScannedAt(clock.instant());
                metrics.counter("gmanager.document.scan","result",result.clean()?"clean":"rejected").increment();
            }catch(Exception e){
                v.setScanStatus(ScanStatus.ERROR);v.setScanDetail("Scanner unavailable");v.setScannedAt(clock.instant());
                metrics.counter("gmanager.document.scan","result","error").increment();
                break; // Do not hold a transaction through a whole batch of scanner timeouts.
            }
        }
    }
}
