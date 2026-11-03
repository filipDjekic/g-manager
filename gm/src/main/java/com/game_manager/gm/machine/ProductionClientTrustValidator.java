package com.game_manager.gm.machine;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component @Profile("prod")
public class ProductionClientTrustValidator implements ApplicationRunner {
    private final StationPolicySigner signer;private final String publicKey;
    public ProductionClientTrustValidator(StationPolicySigner signer,@Value("${STATION_POLICY_SIGNING_PUBLIC_KEY:}")String publicKey){this.signer=signer;this.publicKey=publicKey;}
    @Override public void run(ApplicationArguments args){
        try{
            byte[] probe="GManager deployment policy key verification".getBytes(StandardCharsets.UTF_8);
            var key=KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)));
            var verification=Signature.getInstance("Ed25519");verification.initVerify(key);verification.update(probe);
            if(!verification.verify(Base64.getUrlDecoder().decode(signer.sign(probe))))throw new GeneralSecurityException();
        }catch(Exception e){throw new IllegalStateException("Production policy public/private key pair is missing or does not match");}
    }
}
