package com.game_manager.gm.document;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Bounded clamd INSTREAM. An unavailable/invalid scanner can never label an object CLEAN. */
@Component @ConditionalOnProperty(name="app.documents.scanner",havingValue="clamav")
public class ClamdDocumentScanner implements DocumentScanner {
    private final String host;private final int port;private final long limit;
    public ClamdDocumentScanner(@Value("${CLAMAV_HOST:clamav}")String host,@Value("${CLAMAV_PORT:3310}")int port,
            @Value("${app.documents.max-file-bytes:5242880}")long limit){this.host=host;this.port=port;this.limit=limit;}
    @Override public ScanResult scan(InputStream content,String type){
        try(var socket=new Socket()){
            socket.connect(new InetSocketAddress(host,port),3000);socket.setSoTimeout(30000);
            var output=new DataOutputStream(socket.getOutputStream());output.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            byte[] chunk=new byte[8192];long size=0;int count;
            while((count=content.read(chunk))!=-1){size+=count;if(size>limit)throw new IOException("Scan size limit exceeded");output.writeInt(count);output.write(chunk,0,count);}
            output.writeInt(0);output.flush();
            var result=new ByteArrayOutputStream();int value;
            while((value=socket.getInputStream().read())!=-1&&value!=0){if(result.size()>=4096)throw new IOException("Invalid scanner response");result.write(value);}
            String response=result.toString(StandardCharsets.US_ASCII).trim();
            if(response.equals("stream: OK"))return new ScanResult(true,"Antivirus scan clean");
            if(response.startsWith("stream: ")&&response.endsWith(" FOUND"))return new ScanResult(false,"Antivirus rejected the object");
            throw new IOException("Scanner did not confirm a clean object");
        }catch(IOException e){throw new IllegalStateException("Antivirus scanner unavailable or object could not be verified",e);}
    }
}
