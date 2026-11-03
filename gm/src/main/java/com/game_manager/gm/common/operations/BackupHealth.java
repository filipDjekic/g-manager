package com.game_manager.gm.common.operations;

import io.micrometer.core.instrument.*;
import java.nio.file.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.health.contributor.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component("backup")
public class BackupHealth implements HealthIndicator {
    private final String path;private final ObjectMapper json;
    private final java.time.Clock clock;private final long maxAge,restoreMaxAge;
    private volatile long success,offsite,restore,failed;
    public BackupHealth(@Value("${BACKUP_STATUS_FILE:}")String path,ObjectMapper json,MeterRegistry registry,@Value("${BACKUP_INTERVAL_SECONDS:86400}")long interval,@Value("${BACKUP_RESTORE_INTERVAL:7}")long restoreInterval,java.time.Clock clock){
        this.path=path;this.json=json;
        this.clock=clock;this.maxAge=interval+3600;this.restoreMaxAge=interval*(restoreInterval+1);
        Gauge.builder("gmanager.backup.max.age",()->interval+3600).register(registry);
        Gauge.builder("gmanager.backup.restore.max.age",()->interval*(restoreInterval+1)).register(registry);
        Gauge.builder("gmanager.backup.expected",this,v->v.path.isBlank()?0:1).register(registry);
        Gauge.builder("gmanager.backup.last.success",this,v->v.success).register(registry);
        Gauge.builder("gmanager.backup.last.offsite",this,v->v.offsite).register(registry);
        Gauge.builder("gmanager.backup.last.restore",this,v->v.restore).register(registry);
        Gauge.builder("gmanager.backup.failed",this,v->v.failed).register(registry);
    }
    @Scheduled(fixedDelay=30000) public void refresh(){
        if(path.isBlank())return;
        try{
            var value=json.readTree(Files.readAllBytes(Path.of(path)));
            success=value.path("lastSuccessAt").asLong(0);offsite=value.path("lastOffsiteSuccessAt").asLong(0);restore=value.path("lastRestoreSuccessAt").asLong(0);
            failed="FAILED".equals(value.path("status").asText())?1:0;
        }catch(Exception e){failed=1;}
    }
    @Override public Health health(){refresh();long now=clock.instant().getEpochSecond();boolean fresh=success>0&&offsite>0&&restore>0&&now-success<=maxAge&&now-offsite<=maxAge&&now-restore<=restoreMaxAge;return (path.isBlank()?Health.unknown():(failed==0&&fresh?Health.up():Health.status("DEGRADED"))).withDetail("configured",!path.isBlank()).withDetail("lastSuccess",success).withDetail("lastOffsite",offsite).withDetail("lastRestore",restore).build();}
}
