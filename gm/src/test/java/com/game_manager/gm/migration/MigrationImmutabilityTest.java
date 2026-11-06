package com.game_manager.gm.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import org.junit.jupiter.api.Test;

class MigrationImmutabilityTest {
    @Test
    void distributedMigrationsKeepTheirFlywayChecksums() throws Exception {
        var loader=getClass().getClassLoader();
        try(var manifest=new BufferedReader(new InputStreamReader(
                loader.getResourceAsStream("db/released-migrations.csv"),StandardCharsets.UTF_8))) {
            var entries=manifest.lines().filter(line->!line.startsWith("#") && !line.startsWith("version,") && !line.isBlank()).toList();
            assertThat(entries).hasSize(50);
            for(String entry:entries) {
                var columns=entry.split(",");
                var resource=loader.getResourceAsStream("db/migration/"+columns[1]);
                assertThat(resource).as("Released migration %s exists",columns[1]).isNotNull();
                CRC32 crc=new CRC32();
                try(var reader=new BufferedReader(new InputStreamReader(resource,StandardCharsets.UTF_8))) {
                    String line;boolean first=true;
                    while((line=reader.readLine())!=null) {
                        if(first && line.startsWith("\uFEFF"))line=line.substring(1);
                        first=false;crc.update(line.getBytes(StandardCharsets.UTF_8));
                    }
                }
                assertThat((int)crc.getValue()).as("%s is immutable; add a new migration instead",columns[1])
                        .isEqualTo(Integer.parseInt(columns[2]));
            }
        }
    }
}
