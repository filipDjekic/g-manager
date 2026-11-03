package com.game_manager.gm.notification;

import static org.assertj.core.api.Assertions.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;

class SmtpEmailDeliveryAdapterTest {
    @Test void missingRelayCannotReportSuccess() {
        var adapter=new SmtpEmailDeliveryAdapter("",587,"","","");
        assertThatThrownBy(()->adapter.deliver("recipient@example.test","Test","Body")).isInstanceOf(IllegalStateException.class);
    }
    @Test void plaintextOnlyRelayCannotReceiveCredentialsOrMail() throws Exception {
        try(var server=new ServerSocket(0,1,InetAddress.getLoopbackAddress());var executor=Executors.newSingleThreadExecutor()) {
            var received=executor.submit(()->{
                try(var socket=server.accept()) {
                    socket.setSoTimeout(10000);
                    var output=new PrintWriter(new OutputStreamWriter(socket.getOutputStream(),StandardCharsets.US_ASCII),true);
                    var input=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));
                    output.print("220 isolated SMTP fixture\r\n");output.flush();
                    String hello=input.readLine();
                    output.print("250-isolated\r\n250 AUTH LOGIN\r\n");output.flush();
                    String next=input.readLine();
                    return hello+"\n"+next;
                }
            });
            var adapter=new SmtpEmailDeliveryAdapter("127.0.0.1",server.getLocalPort(),"disposable-user","disposable-password","sender@example.test");
            assertThatThrownBy(()->adapter.deliver("recipient@example.test","Test","Body")).isInstanceOf(org.springframework.mail.MailException.class);
            assertThat(received.get(15,TimeUnit.SECONDS)).startsWith("EHLO").doesNotContain("AUTH LOGIN\n","DATA","disposable-password");
        }
    }
}
