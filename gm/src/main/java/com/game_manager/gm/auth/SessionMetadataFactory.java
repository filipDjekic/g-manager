package com.game_manager.gm.auth;

import com.game_manager.gm.common.config.GManagerProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.Locale;

@Component
public class SessionMetadataFactory {
    private static final int MAX_USER_AGENT_LENGTH = 160;
    private final SecretKeySpec ipHashKey;

    public SessionMetadataFactory(GManagerProperties properties) {
        this.ipHashKey = new SecretKeySpec(
                properties.jwt().secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    public SessionRequestMetadata from(HttpServletRequest request) {
        String summary = summarize(request.getHeader("User-Agent"));
        return new SessionRequestMetadata(deviceLabel(summary), summary, hashIp(request.getRemoteAddr()));
    }

    private String summarize(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return "Unknown client";
        String sanitized = userAgent.replaceAll("[\\p{Cntrl}]", " ").trim().replaceAll("\\s+", " ");
        return sanitized.substring(0, Math.min(sanitized.length(), MAX_USER_AGENT_LENGTH));
    }

    private String deviceLabel(String summary) {
        String lower = summary.toLowerCase(Locale.ROOT);
        String browser = lower.contains("edg/") ? "Edge"
                : lower.contains("firefox/") ? "Firefox"
                : lower.contains("chrome/") ? "Chrome"
                : lower.contains("safari/") ? "Safari" : "Unknown browser";
        String platform = lower.contains("windows") ? "Windows"
                : lower.contains("android") ? "Android"
                : lower.contains("iphone") || lower.contains("ipad") ? "iOS"
                : lower.contains("mac os") || lower.contains("macintosh") ? "macOS"
                : lower.contains("linux") ? "Linux" : "Unknown device";
        return browser + " on " + platform;
    }

    private String hashIp(String ip) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(ipHashKey);
            return HexFormat.of().formatHex(mac.doFinal(
                    (ip == null ? "unknown" : ip).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("IP privacy hashing is unavailable", exception);
        }
    }
}
