package com.game_manager.gm.document.storage;
import com.game_manager.gm.common.config.GManagerProperties; import java.io.*; import java.nio.file.*; import java.security.*; import java.util.HexFormat; import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty; import org.springframework.stereotype.Component;
@Component @ConditionalOnProperty(prefix="app.documents",name="backend",havingValue="local",matchIfMissing=true)
public class LocalDocumentStorage implements DocumentStorage {
 private final Path root; public LocalDocumentStorage(GManagerProperties p){root=p.storage().localRoot().toAbsolutePath().normalize().resolve("objects");}
 public StoredObject store(String key,InputStream input,long size){Path target=resolve(key);try{Files.createDirectories(target.getParent());MessageDigest digest=MessageDigest.getInstance("SHA-256");long copied;try(var stream=new DigestInputStream(input,digest)){copied=Files.copy(stream,target,StandardCopyOption.REPLACE_EXISTING);}if(copied!=size){Files.deleteIfExists(target);throw new IllegalStateException("Stored object size mismatch");}return new StoredObject(key,copied,HexFormat.of().formatHex(digest.digest()));}catch(IOException|NoSuchAlgorithmException e){throw new IllegalStateException("Object storage write failed",e);}}
 public InputStream open(String key){try{return Files.newInputStream(resolve(key));}catch(IOException e){throw new IllegalStateException("Object storage read failed",e);}}
 public void delete(String key){try{Files.deleteIfExists(resolve(key));}catch(IOException e){throw new IllegalStateException("Object storage delete failed",e);}}
 public boolean exists(String key){return Files.isRegularFile(resolve(key));}
 private Path resolve(String key){if(key==null||key.startsWith("/")||key.contains("..")||key.contains("\\"))throw new IllegalArgumentException("Invalid object key");Path value=root.resolve(key).normalize();if(!value.startsWith(root))throw new IllegalArgumentException("Invalid object key");return value;}
}
