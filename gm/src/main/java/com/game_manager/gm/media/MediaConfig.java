package com.game_manager.gm.media;

import com.game_manager.gm.common.config.GManagerProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;

@Configuration
public class MediaConfig implements WebMvcConfigurer {
    private final String root;

    public MediaConfig(GManagerProperties properties) {
        this.root = properties.storage().localRoot().toString();
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Path.of(root).toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/media/**").addResourceLocations(location);
    }
}
