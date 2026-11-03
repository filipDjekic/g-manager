package com.game_manager.gm.document;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
@Component @Profile("prod")
public class ProductionScannerGuard implements ApplicationRunner {
    private final String scanner;
    public ProductionScannerGuard(@Value("${app.documents.scanner:}")String scanner){this.scanner=scanner;}
    @Override public void run(ApplicationArguments args){if(!"clamav".equals(scanner))throw new IllegalStateException("Production requires the configured antivirus scanner; test-signature scanning is forbidden");}
}
