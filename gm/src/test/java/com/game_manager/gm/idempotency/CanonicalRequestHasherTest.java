package com.game_manager.gm.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class CanonicalRequestHasherTest {
    private final CanonicalRequestHasher hasher = new CanonicalRequestHasher(new ObjectMapper());

    @Test
    void ignoresObjectOrderWhitespaceAndEquivalentNumberFormatting() throws Exception {
        byte[] first = "{\"items\":[{\"quantity\":1,\"productId\":\"a\"}],\"value\":1.0}"
                .getBytes(StandardCharsets.UTF_8);
        byte[] second = " { \"value\" : 1.00, \"items\" : [ { \"productId\" : \"a\", \"quantity\" : 1 } ] } "
                .getBytes(StandardCharsets.UTF_8);
        assertThat(hasher.hash(first)).isEqualTo(hasher.hash(second));
    }

    @Test
    void preservesArrayOrderAndSemanticDifferences() throws Exception {
        assertThat(hasher.hash("{\"items\":[1,2]}".getBytes(StandardCharsets.UTF_8)))
                .isNotEqualTo(hasher.hash("{\"items\":[2,1]}".getBytes(StandardCharsets.UTF_8)));
    }
}
