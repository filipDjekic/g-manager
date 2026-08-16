package com.game_manager.gm.machine;
import java.nio.charset.StandardCharsets;import java.security.*;import java.security.spec.X509EncodedKeySpec;import java.util.*;
public final class MachineCrypto {
 private MachineCrypto(){}
 public static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(GeneralSecurityException e){throw new IllegalStateException("SHA-256 unavailable",e);}}
 public static PublicKey publicKey(String base64){try{byte[] encoded=Base64.getDecoder().decode(base64.replaceAll("\\s",""));return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encoded));}catch(GeneralSecurityException|IllegalArgumentException e){throw new IllegalArgumentException("Public key must be a Base64 X.509 Ed25519 key",e);}}
 public static String fingerprint(PublicKey key){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getEncoded()));}catch(GeneralSecurityException e){throw new IllegalStateException(e);}}
 public static boolean verify(PublicKey key,String value,String signature){try{Signature verifier=Signature.getInstance("Ed25519");verifier.initVerify(key);verifier.update(value.getBytes(StandardCharsets.UTF_8));return verifier.verify(Base64.getUrlDecoder().decode(signature));}catch(GeneralSecurityException|IllegalArgumentException e){return false;}}
}
