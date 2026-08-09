package testsupport;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

public final class TestClock {
    public static final Instant NOW = Instant.parse("2028-03-15T10:00:00Z");

    private TestClock() {
    }

    public static Clock fixedUtc() {
        return Clock.fixed(NOW, ZoneId.of("UTC"));
    }
}
