package com.game_manager.gm.testsupport;

import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.regex.Pattern;
import org.flywaydb.core.api.ResourceProvider;
import org.flywaydb.core.api.resource.LoadableResource;
import org.springframework.boot.flyway.autoconfigure.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Test-classpath only: run the real migrations on H2 without modifying released MySQL checksums. */
@Configuration(proxyBeanMethods = false)
@Profile("test")
public class H2MigrationConfiguration {
    @Bean
    FlywayConfigurationCustomizer h2MigrationSyntax() {
        return configuration -> {
            try (var connection = configuration.getDataSource().getConnection()) {
                if (!"H2".equals(connection.getMetaData().getDatabaseProductName())) {
                    return;
                }
                Resource[] scripts = new PathMatchingResourcePatternResolver()
                        .getResources("classpath*:db/migration/*.sql");
                List<LoadableResource> resources = Arrays.stream(scripts)
                        .map(H2Resource::new).map(resource -> (LoadableResource) resource).toList();
                configuration.resourceProvider(new ResourceProvider() {
                    @Override
                    public LoadableResource getResource(String name) {
                        return resources.stream().filter(resource -> resource.getFilename().equals(name)).findFirst().orElse(null);
                    }

                    @Override
                    public Collection<LoadableResource> getResources(String prefix, String[] suffixes) {
                        return resources.stream().filter(resource -> resource.getFilename().startsWith(prefix)
                                && Arrays.stream(suffixes).anyMatch(resource.getFilename()::endsWith)).toList();
                    }
                });
            } catch (SQLException | IOException exception) {
                throw new IllegalStateException("Cannot prepare isolated H2 migration resources", exception);
            }
        };
    }

    // H2 MySQL mode accepts individual MODIFY / ADD clauses, but not MySQL's compound ALTER TABLE.
    static String splitCompoundAlter(String sql) {
        var matcher = Pattern.compile("(?is)\\bALTER\\s+TABLE\\s+(\\w+)\\s+([^;]+);").matcher(sql);
        return matcher.replaceAll(match -> {
            String clauses = match.group(2);
            StringBuilder result = new StringBuilder("ALTER TABLE " + match.group(1) + " ");
            int depth = 0;
            char quote = 0;
            for (int index = 0; index < clauses.length(); index++) {
                char character = clauses.charAt(index);
                if (quote != 0) {
                    if (character == quote && (index == 0 || clauses.charAt(index - 1) != '\\')) {
                        quote = 0;
                    }
                } else if (character == '\'' || character == '"' || character == '`') {
                    quote = character;
                } else if (character == '(') {
                    depth++;
                } else if (character == ')') {
                    depth--;
                } else if (character == ',' && depth == 0) {
                    result.append(";\nALTER TABLE ").append(match.group(1)).append(' ');
                    continue;
                }
                result.append(character);
            }
            return java.util.regex.Matcher.quoteReplacement(result.append(';').toString());
        });
    }

    private static final class H2Resource extends LoadableResource {
        private final Resource resource;

        private H2Resource(Resource resource) { this.resource = resource; }

        @Override
        public Reader read() {
            try {
                return new StringReader(splitCompoundAlter(resource.getContentAsString(StandardCharsets.UTF_8)));
            } catch (IOException exception) {
                throw new IllegalStateException("Cannot read migration " + getFilename(), exception);
            }
        }

        @Override
        public String getAbsolutePath() { return resource.getDescription(); }
        @Override
        public String getAbsolutePathOnDisk() { return getAbsolutePath(); }
        @Override
        public String getFilename() { return resource.getFilename(); }
        @Override
        public String getRelativePath() { return getFilename(); }
    }
}
