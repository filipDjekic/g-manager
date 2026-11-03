package com.game_manager.gm.notification;

import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

/** Optional actual delivery. Missing configuration is a failure, never a pretend successful send. */
@Component @Profile("prod")
public class SmtpEmailDeliveryAdapter implements EmailDeliveryAdapter {
    private final JavaMailSenderImpl sender;private final String from;
    public SmtpEmailDeliveryAdapter(@Value("${SMTP_HOST:}")String host,@Value("${SMTP_PORT:587}")int port,
            @Value("${SMTP_USERNAME:}")String username,@Value("${SMTP_PASSWORD:}")String password,@Value("${SMTP_FROM:}")String from){
        sender=new JavaMailSenderImpl();sender.setHost(host);sender.setPort(port);sender.setUsername(username);sender.setPassword(password);this.from=from;
        Properties settings=new Properties();settings.setProperty("mail.smtp.auth","true");
        settings.setProperty("mail.smtp.starttls.enable","true");settings.setProperty("mail.smtp.starttls.required","true");settings.setProperty("mail.smtp.ssl.checkserveridentity","true");
        settings.setProperty("mail.smtp.connectiontimeout","5000");settings.setProperty("mail.smtp.timeout","10000");settings.setProperty("mail.smtp.writetimeout","10000");sender.setJavaMailProperties(settings);
    }
    @Override public void deliver(String recipientEmail,String title,String body){
        if(sender.getHost()==null||sender.getHost().isBlank()||from.isBlank()||sender.getUsername()==null||sender.getUsername().isBlank()||sender.getPassword()==null||sender.getPassword().isBlank())throw new IllegalStateException("SMTP delivery is not configured");
        var message=new SimpleMailMessage();message.setFrom(from);message.setTo(recipientEmail);message.setSubject(title);message.setText(body);sender.send(message);
    }
}
