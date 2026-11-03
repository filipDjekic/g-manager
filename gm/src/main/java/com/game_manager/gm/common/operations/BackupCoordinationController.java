package com.game_manager.gm.common.operations;

import com.game_manager.gm.common.error.ApplicationException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Private Docker-network endpoint, never reverse-proxied. No database/restore commands are accepted. */
@RestController @RequestMapping("/internal/backup")
public class BackupCoordinationController {
    private final BackupQuiescence barrier;private final byte[] key;private final BackupDocumentPort documents;
    private final org.springframework.core.env.Environment environment;
    public BackupCoordinationController(BackupQuiescence barrier,BackupDocumentPort documents,@Value("${BACKUP_COORDINATION_KEY:}")String key,org.springframework.core.env.Environment environment){this.barrier=barrier;this.documents=documents;this.key=key.getBytes(StandardCharsets.UTF_8);this.environment=environment;}
    private void authorize(String value){
        if(key.length<32||!MessageDigest.isEqual(key,value.getBytes(StandardCharsets.UTF_8)))
            throw new ApplicationException(HttpStatus.UNAUTHORIZED,"Backup authorization required");
    }
    @PostMapping public BackupQuiescence.Lease begin(@RequestHeader(value="X-GManager-Backup-Key",defaultValue="")String token) throws InterruptedException {authorize(token);return barrier.begin();}
    @GetMapping("/{id}") public BackupQuiescence.Lease verify(@RequestHeader(value="X-GManager-Backup-Key",defaultValue="")String token,@PathVariable UUID id){authorize(token);return barrier.verify(id);}
    @DeleteMapping("/{id}") public void end(@RequestHeader(value="X-GManager-Backup-Key",defaultValue="")String token,@PathVariable UUID id){authorize(token);barrier.end(id);}
    @GetMapping("/{id}/metadata")
    public Map<String,String> metadata(@RequestHeader(value="X-GManager-Backup-Key",defaultValue="")String token,@PathVariable UUID id){
        authorize(token);barrier.verify(id);
        // Explicit public recovery fields only. Never enumerate the environment or export configuration beans.
        var sources=Map.ofEntries(Map.entry("appRelease","APP_RELEASE"),Map.entry("backendImage","BACKEND_IMAGE"),Map.entry("frontendImage","FRONTEND_IMAGE"),
            Map.entry("clientVersion","app.gaming-client.version"),Map.entry("clientMinimumVersion","app.gaming-client.minimum-version"),
            Map.entry("clientSha256","app.gaming-client.sha256"),Map.entry("clientPublisher","app.gaming-client.package-signing-subject"),
            Map.entry("clientPublisherThumbprint","GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT"),Map.entry("policyKeyId","app.gaming-client.policy-signing-key-id"),
            Map.entry("policyPublicKey","STATION_POLICY_SIGNING_PUBLIC_KEY"),Map.entry("canonicalOrigin","CANONICAL_ORIGIN"));
        var values=new java.util.TreeMap<String,String>();values.put("formatVersion","1");
        sources.forEach((name,property)->values.put(name,environment.getProperty(property,"UNSPECIFIED")));
        return values;
    }
    @GetMapping(value="/{id}/documents",produces="application/zip")
    public void documents(@RequestHeader(value="X-GManager-Backup-Key",defaultValue="")String token,@PathVariable UUID id,jakarta.servlet.http.HttpServletResponse response) throws java.io.IOException {
        authorize(token);barrier.verify(id);response.setHeader("Cache-Control","no-store");documents.writeArchive(response.getOutputStream());barrier.verify(id);
    }
}
