package com.game_manager.gm.customer;

import com.game_manager.gm.common.config.GManagerProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class CustomerActivationHash {
    private final SecretKeySpec key;

    public CustomerActivationHash(GManagerProperties properties) {
        key = new SecretKeySpec(properties.jwt().secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    public String hash(String purpose, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            // Domain separation from JWT signatures, IP privacy hashes and other activation keys.
            return HexFormat.of().formatHex(mac.doFinal(
                    ("customer-activation:" + purpose + ":" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Activation hashing is unavailable", exception);
        }
    }
}
