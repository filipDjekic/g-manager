package com.game_manager.gm.machine;
import static org.assertj.core.api.Assertions.assertThat;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.Base64;import org.junit.jupiter.api.Test;
class MachineCryptoTest {
 @Test void verifiesEd25519ChallengeAndRejectsChangedNonce()throws Exception{KeyPair pair=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();String value="challenge:identity:nonce";Signature signer=Signature.getInstance("Ed25519");signer.initSign(pair.getPrivate());signer.update(value.getBytes(StandardCharsets.UTF_8));String signature=Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());PublicKey decoded=MachineCrypto.publicKey(Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));assertThat(MachineCrypto.verify(decoded,value,signature)).isTrue();assertThat(MachineCrypto.verify(decoded,value+"-replay",signature)).isFalse();}
}
