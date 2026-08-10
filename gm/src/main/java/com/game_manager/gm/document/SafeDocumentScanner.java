package com.game_manager.gm.document;
import java.io.*; import java.nio.charset.StandardCharsets; import org.springframework.stereotype.Component;
@Component public class SafeDocumentScanner implements DocumentScanner {
 private static final byte[] TEST_SIGNATURE="EICAR-STANDARD-ANTIVIRUS-TEST-FILE".getBytes(StandardCharsets.US_ASCII);
 public ScanResult scan(InputStream content,String contentType){try{byte[] bytes=content.readAllBytes();if(indexOf(bytes,TEST_SIGNATURE)>=0)return new ScanResult(false,"Malware test signature detected");return new ScanResult(true,"Signature scan clean");}catch(IOException e){throw new IllegalStateException("Scanner could not read object",e);}}
 private static int indexOf(byte[] source,byte[] target){outer:for(int i=0;i<=source.length-target.length;i++){for(int j=0;j<target.length;j++)if(source[i+j]!=target[j])continue outer;return i;}return -1;}
}
