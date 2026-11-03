package com.game_manager.gm.common.operations;
import static org.assertj.core.api.Assertions.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.file.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

class BackupHealthTest {
    @TempDir Path temporary;
    @Test void oldSuccessOrMissingStatusNeverAppearsHealthy() throws Exception {
        var now=Instant.parse("2026-11-03T12:00:00Z");long epoch=now.getEpochSecond();var path=temporary.resolve("status.json");
        var json=new ObjectMapper();var clock=Clock.fixed(now,ZoneOffset.UTC);
        var health=new BackupHealth(path.toString(),json,new SimpleMeterRegistry(),86400,7,clock);
        Files.writeString(path,"{\"status\":\"SUCCESS\",\"lastSuccessAt\":"+(epoch-90001)+",\"lastOffsiteSuccessAt\":"+epoch+",\"lastRestoreSuccessAt\":"+epoch+"}");
        assertThat(health.health().getStatus().getCode()).isEqualTo("DEGRADED");
        Files.writeString(path,"{\"status\":\"SUCCESS\",\"lastSuccessAt\":"+epoch+",\"lastOffsiteSuccessAt\":"+epoch+",\"lastRestoreSuccessAt\":"+epoch+"}");
        assertThat(health.health().getStatus().getCode()).isEqualTo("UP");
        Files.delete(path);assertThat(health.health().getStatus().getCode()).isEqualTo("DEGRADED");
        assertThat(new BackupHealth("",json,new SimpleMeterRegistry(),86400,7,clock).health().getStatus().getCode()).isEqualTo("UNKNOWN");
    }
}
