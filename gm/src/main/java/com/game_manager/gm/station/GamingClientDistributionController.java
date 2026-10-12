package com.game_manager.gm.station;

import com.game_manager.gm.common.error.ApplicationException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stations/client-package")
public class GamingClientDistributionController {
    private final String version, status, downloadUrl, sha256, signingSubject, minimumVersion;
    private final HttpClient downloads = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public GamingClientDistributionController(
            @Value("${app.gaming-client.version}") String version,
            @Value("${app.gaming-client.status}") String status,
            @Value("${app.gaming-client.download-url}") String downloadUrl,
            @Value("${app.gaming-client.sha256}") String sha256,
            @Value("${app.gaming-client.package-signing-subject}") String signingSubject,
            @Value("${app.gaming-client.minimum-version}") String minimumVersion) {
        this.version = version; this.status = status; this.downloadUrl = downloadUrl;
        this.sha256 = sha256; this.signingSubject = signingSubject; this.minimumVersion = minimumVersion;
    }

    @GetMapping
    public Map<String, String> packageInfo() {
        return Map.of("version", version, "minimumVersion", minimumVersion, "status", status,
                "downloadUrl", downloadUrl, "sha256", sha256, "signingSubject", signingSubject);
    }

    // The configured HTTPS publisher is checked server-side so browser CORS/CSP
    // never needs to be weakened. These subroutes retain STATION_READ protection.
    @GetMapping("/availability")
    public PackageAvailability availability() {
        try {
            URI uri = remotePackage();
            HttpResponse<Void> response = downloads.send(request(uri).method("HEAD", HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() == 405 || response.statusCode() == 501) {
                try (InputStream stream = openRemotePackage()) {
                    byte[] prefix = stream.readNBytes(4);
                    return new PackageAvailability(zipPrefix(prefix), zipPrefix(prefix) ? "" : unavailable());
                }
            }
            boolean available = response.statusCode() == 200 && "https".equalsIgnoreCase(response.uri().getScheme())
                    && zipContentType(response.headers().firstValue("Content-Type").orElse(""));
            return new PackageAvailability(available, available ? "" : unavailable());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new PackageAvailability(false, unavailable());
        } catch (IOException | IllegalArgumentException | ApplicationException exception) {
            return new PackageAvailability(false, unavailable());
        }
    }

    @GetMapping("/download")
    public ResponseEntity<Resource> download() {
        InputStream stream = openRemotePackage();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("GManager.Client.zip").build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(stream));
    }

    private URI remotePackage() {
        if (!"RELEASED".equals(status.trim()) || !version.trim().matches("[0-9]+[.][0-9]+(?:[.][0-9]+){0,2}") || !sha256.matches("(?i)[0-9a-f]{64}")
                || signingSubject.isBlank() || "UNPUBLISHED".equalsIgnoreCase(signingSubject.trim())) {
            throw new ApplicationException(HttpStatus.NOT_FOUND, "Gaming Client paket još nije objavljen.");
        }
        URI uri = URI.create(downloadUrl.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new ApplicationException(HttpStatus.NOT_FOUND, "Spoljašnji HTTPS paket nije konfigurisan.");
        }
        return uri;
    }

    private HttpRequest.Builder request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                .header("Accept", "application/zip, application/octet-stream");
    }

    private InputStream openRemotePackage() {
        try {
            // Only the configured publisher is used; no caller-supplied URL,
            // access token or session cookie is forwarded to that server.
            HttpResponse<InputStream> response = downloads.send(request(remotePackage()).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200 || !"https".equalsIgnoreCase(response.uri().getScheme())
                    || !zipContentType(response.headers().firstValue("Content-Type").orElse(""))) {
                response.body().close();
                throw new ApplicationException(HttpStatus.BAD_GATEWAY, unavailable());
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApplicationException(HttpStatus.BAD_GATEWAY, unavailable());
        } catch (IOException | IllegalArgumentException exception) {
            throw new ApplicationException(HttpStatus.BAD_GATEWAY, unavailable());
        }
    }

    private static boolean zipContentType(String value) {
        String type = value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return type.equals("application/zip") || type.equals("application/x-zip-compressed")
                || type.equals("application/octet-stream");
    }

    private static boolean zipPrefix(byte[] value) {
        return value.length == 4 && value[0] == 0x50 && value[1] == 0x4b && value[2] == 0x03 && value[3] == 0x04;
    }

    private static String unavailable() {
        return "Gaming Client paket trenutno nije dostupan kod izdavača. Proverite objavu i pokušajte ponovo.";
    }

    public record PackageAvailability(boolean available, String message) {}
}
