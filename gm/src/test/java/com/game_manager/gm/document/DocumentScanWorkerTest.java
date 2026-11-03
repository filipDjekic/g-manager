package com.game_manager.gm.document;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.game_manager.gm.document.storage.DocumentStorage;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.*;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class DocumentScanWorkerTest {
    @Test void scannerOutageRemainsQuarantinedAndRetriesAfterTheBackoff() throws Exception {
        var repository=mock(DocumentVersionRepository.class);var storage=mock(DocumentStorage.class);var scanner=mock(DocumentScanner.class);
        var now=Instant.parse("2026-11-03T12:00:00Z");var version=new DocumentVersion();version.setObjectKey("quarantine/test");version.setContentType("text/plain");
        when(repository.findTop50ByScanStatusOrderByCreatedAtAsc(ScanStatus.PENDING)).thenReturn(List.of(version),List.of());
        when(repository.findTop50ByScanStatusAndScanDetailAndScannedAtBeforeOrderByScannedAtAsc(ScanStatus.ERROR,"Scanner unavailable",now.minusSeconds(60))).thenReturn(List.of(),List.of(version));
        when(storage.open("quarantine/test")).thenAnswer(call->new ByteArrayInputStream(new byte[]{1}));
        when(scanner.scan(any(),eq("text/plain"))).thenThrow(new IllegalStateException("offline")).thenReturn(new DocumentScanner.ScanResult(true,"Clean"));
        var worker=new DocumentScanWorker(repository,storage,scanner,Clock.fixed(now,ZoneOffset.UTC),new SimpleMeterRegistry());
        worker.scanPending();assertThat(version.getScanStatus()).isEqualTo(ScanStatus.ERROR);assertThat(version.getScanDetail()).isEqualTo("Scanner unavailable");
        worker.scanPending();assertThat(version.getScanStatus()).isEqualTo(ScanStatus.CLEAN);
        verify(repository,times(2)).findTop50ByScanStatusAndScanDetailAndScannedAtBeforeOrderByScannedAtAsc(ScanStatus.ERROR,"Scanner unavailable",now.minusSeconds(60));
    }
}
