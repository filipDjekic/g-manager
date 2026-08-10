package com.game_manager.gm.notification;
import io.micrometer.core.instrument.MeterRegistry; import org.slf4j.Logger; import org.slf4j.LoggerFactory; import org.springframework.stereotype.Component;
@Component public class SandboxEmailDeliveryAdapter implements EmailDeliveryAdapter {
 private static final Logger LOG=LoggerFactory.getLogger(SandboxEmailDeliveryAdapter.class); private final MeterRegistry metrics;
 public SandboxEmailDeliveryAdapter(MeterRegistry metrics){this.metrics=metrics;}
 public void deliver(String recipientEmail,String title,String body){metrics.counter("gm.notification.email.sandbox.delivered").increment();LOG.info("Sandbox email accepted recipientDomain={} titleLength={} bodyLength={}",domain(recipientEmail),title.length(),body.length());}
 private String domain(String email){int at=email.indexOf('@');return at<0?"invalid":email.substring(at+1);}
}
