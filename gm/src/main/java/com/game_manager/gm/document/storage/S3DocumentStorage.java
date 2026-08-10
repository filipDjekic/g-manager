package com.game_manager.gm.document.storage;
import com.game_manager.gm.common.config.GManagerProperties; import java.io.*; import java.net.URI; import java.security.*; import java.util.HexFormat; import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty; import org.springframework.stereotype.Component; import software.amazon.awssdk.auth.credentials.*; import software.amazon.awssdk.core.sync.RequestBody; import software.amazon.awssdk.regions.Region; import software.amazon.awssdk.services.s3.*; import software.amazon.awssdk.services.s3.model.*;
@Component @ConditionalOnProperty(prefix="app.documents",name="backend",havingValue="s3")
public class S3DocumentStorage implements DocumentStorage {
 private final S3Client client; private final String bucket;
 public S3DocumentStorage(GManagerProperties p){var c=p.documents();if(blank(c.s3Bucket())||blank(c.s3AccessKey())||blank(c.s3SecretKey()))throw new IllegalStateException("S3 document storage credentials and bucket are required");var b=S3Client.builder().region(Region.of(c.s3Region())).forcePathStyle(true).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(c.s3AccessKey(),c.s3SecretKey())));if(!blank(c.s3Endpoint()))b.endpointOverride(URI.create(c.s3Endpoint()));client=b.build();bucket=c.s3Bucket();}
 S3DocumentStorage(S3Client client,String bucket){this.client=client;this.bucket=bucket;}
 public StoredObject store(String key,InputStream input,long size){validate(key);try{MessageDigest d=MessageDigest.getInstance("SHA-256");client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).build(),RequestBody.fromInputStream(new DigestInputStream(input,d),size));return new StoredObject(key,size,HexFormat.of().formatHex(d.digest()));}catch(NoSuchAlgorithmException|S3Exception e){throw new IllegalStateException("Object storage write failed",e);}}
 public InputStream open(String key){validate(key);return client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());}
 public void delete(String key){validate(key);client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());}
 public boolean exists(String key){try{client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());return true;}catch(S3Exception e){return false;}}
 private static boolean blank(String s){return s==null||s.isBlank();} private static void validate(String key){if(key==null||key.startsWith("/")||key.contains("..")||key.contains("\\"))throw new IllegalArgumentException("Invalid object key");}
}
