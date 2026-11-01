package com.game_manager.gm.customer;

import com.game_manager.gm.common.error.ApplicationException;
import java.security.SecureRandom;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class CustomerActivationCodeGenerator {
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final CustomerActivationGuard guard;
    private final CustomerActivationTokenRepository tokens;
    private final CustomerActivationHash hashes;
    private final SecureRandom random = new SecureRandom();

    @Transactional(propagation = Propagation.MANDATORY)
    public String generate() {
        // Lock survives until the caller commits its token insert. The unique DB constraint
        // is a second line of defense. Retained consumed/expired codes are not reused either.
        guard.lockGeneration();
        for (int attempt = 0; attempt < 128; attempt++) {
            StringBuilder code = new StringBuilder(4);
            for (int i = 0; i < 4; i++) code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            String value = code.toString();
            // A locking read also sees commits newer than MySQL's repeatable-read snapshot.
            if (tokens.findByHashForUpdate(hashes.hash("code", value)).isEmpty()) return value;
        }
        throw new ApplicationException(HttpStatus.SERVICE_UNAVAILABLE, "Customer activation is temporarily unavailable");
    }
}
