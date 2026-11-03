package com.game_manager.gm.machine;
import static org.assertj.core.api.Assertions.*;
import java.security.KeyPairGenerator;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class ProductionClientTrustValidatorTest {
    @Test void productionRequiresTheMatchingPublicAndPrivateKeyWithoutGeneratingFallbackKeys() throws Exception {
        var generator=KeyPairGenerator.getInstance("Ed25519");var key=generator.generateKeyPair();
        var signer=new StationPolicySigner(Base64.getEncoder().encodeToString(key.getPrivate().getEncoded()),"isolated-test");
        assertThatCode(()->new ProductionClientTrustValidator(signer,Base64.getEncoder().encodeToString(key.getPublic().getEncoded())).run(null)).doesNotThrowAnyException();
        for(String publicKey:new String[]{"","not-base64",Base64.getEncoder().encodeToString(generator.generateKeyPair().getPublic().getEncoded())})
            assertThatThrownBy(()->new ProductionClientTrustValidator(signer,publicKey).run(null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->new ProductionClientTrustValidator(new StationPolicySigner("","unconfigured"),Base64.getEncoder().encodeToString(key.getPublic().getEncoded())).run(null)).isInstanceOf(IllegalStateException.class);
    }
}
