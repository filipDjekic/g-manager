package com.game_manager.gm.common.observability;

import java.util.regex.Pattern;

public final class SensitiveDataSanitizer {
    private static final Pattern SECRET = Pattern.compile(
            "(?i)(password|secret|token|authorization|cookie)([\\s\"']*[:=][\\s\"']*)([^\\s,;\"'}]+)");
    private static final Pattern BEARER = Pattern.compile("(?i)Bearer\\s+[A-Za-z0-9._~+/-]+=*");
    private static final Pattern EMAIL = Pattern.compile(
            "(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}");

    private SensitiveDataSanitizer() {
    }

    public static String redact(String value) {
        if (value == null) {
            return null;
        }
        String sanitized = BEARER.matcher(value).replaceAll("Bearer [REDACTED]");
        sanitized = SECRET.matcher(sanitized).replaceAll("$1$2[REDACTED]");
        return EMAIL.matcher(sanitized).replaceAll("[REDACTED_EMAIL]");
    }
}
