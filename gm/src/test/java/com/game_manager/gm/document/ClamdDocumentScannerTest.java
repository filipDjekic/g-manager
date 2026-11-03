package com.game_manager.gm.document;
import static org.assertj.core.api.Assertions.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;

class ClamdDocumentScannerTest {
    void response(String reply,boolean clean) throws Exception {
        try(var server=new ServerSocket(0,1,InetAddress.getLoopbackAddress());var executor=Executors.newSingleThreadExecutor()){
            var listener=executor.submit(()->{try(var socket=server.accept()){
                var input=new DataInputStream(socket.getInputStream());assertThat(new String(input.readNBytes(10),StandardCharsets.US_ASCII)).isEqualTo("zINSTREAM\0");
                assertThat(input.readInt()).isEqualTo(5);assertThat(new String(input.readNBytes(5),StandardCharsets.US_ASCII)).isEqualTo("hello");assertThat(input.readInt()).isZero();
                socket.getOutputStream().write((reply+"\0").getBytes(StandardCharsets.US_ASCII));return true;
            }});
            var scanner=new ClamdDocumentScanner("127.0.0.1",server.getLocalPort(),100);
            assertThat(scanner.scan(new ByteArrayInputStream("hello".getBytes(StandardCharsets.US_ASCII)),"text/plain").clean()).isEqualTo(clean);
            assertThat(listener.get(10,TimeUnit.SECONDS)).isTrue();
        }
    }
    @Test void confirmedCleanAndMalwareResponsesAreDistinct() throws Exception {response("stream: OK",true);response("stream: Test.Signature FOUND",false);}
    @Test void unavailableScannerCannotApproveContent() throws Exception {
        int port;try(var server=new ServerSocket(0)){port=server.getLocalPort();}
        var scanner=new ClamdDocumentScanner("127.0.0.1",port,100);
        assertThatThrownBy(()->scanner.scan(new ByteArrayInputStream(new byte[1]),"text/plain")).isInstanceOf(IllegalStateException.class);
    }
}
