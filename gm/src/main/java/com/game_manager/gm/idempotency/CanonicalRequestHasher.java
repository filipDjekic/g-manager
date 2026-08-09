package com.game_manager.gm.idempotency;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class CanonicalRequestHasher {
    private final ObjectMapper objectMapper;

    public CanonicalRequestHasher(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String hash(byte[] body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        String canonical = canonical(root);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String canonical(JsonNode node) {
        if (node == null || node.isNull()) return "null";
        if (node.isObject()) {
            List<String> names = new ArrayList<>();
            node.propertyStream().map(java.util.Map.Entry::getKey).forEach(names::add);
            names.sort(Comparator.naturalOrder());
            StringBuilder result = new StringBuilder("{");
            for (int index = 0; index < names.size(); index++) {
                if (index > 0) result.append(',');
                String name = names.get(index);
                result.append(jsonString(name)).append(':').append(canonical(node.get(name)));
            }
            return result.append('}').toString();
        }
        if (node.isArray()) {
            StringBuilder result = new StringBuilder("[");
            for (int index = 0; index < node.size(); index++) {
                if (index > 0) result.append(',');
                result.append(canonical(node.get(index)));
            }
            return result.append(']').toString();
        }
        if (node.isNumber()) {
            BigDecimal value = node.decimalValue().stripTrailingZeros();
            return value.signum() == 0 ? "0" : value.toPlainString();
        }
        if (node.isTextual()) return jsonString(node.asText());
        return node.asBoolean() ? "true" : "false";
    }

    private String jsonString(String value) {
        return objectMapper.writeValueAsString(value);
    }
}
