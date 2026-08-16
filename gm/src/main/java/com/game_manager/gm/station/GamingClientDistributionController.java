package com.game_manager.gm.station;
import java.util.Map;import org.springframework.beans.factory.annotation.Value;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/stations/client-package") public class GamingClientDistributionController {
 private final String version,status,downloadUrl,sha256,signingSubject,minimumVersion;
 public GamingClientDistributionController(@Value("${app.gaming-client.version}")String version,@Value("${app.gaming-client.status}")String status,@Value("${app.gaming-client.download-url}")String downloadUrl,@Value("${app.gaming-client.sha256}")String sha256,@Value("${app.gaming-client.package-signing-subject}")String signingSubject,@Value("${app.gaming-client.minimum-version}")String minimumVersion){this.version=version;this.status=status;this.downloadUrl=downloadUrl;this.sha256=sha256;this.signingSubject=signingSubject;this.minimumVersion=minimumVersion;}
 @GetMapping public Map<String,String> packageInfo(){return Map.of("version",version,"minimumVersion",minimumVersion,"status",status,"downloadUrl",downloadUrl,"sha256",sha256,"signingSubject",signingSubject);}
}
