package com.game_manager.gm.gamingsession;

import java.nio.file.Path;
import java.util.List;
import org.testcontainers.images.builder.ImageFromDockerfile;

/** Build the actual production backup image once per test JVM, shared by both restore suites. */
final class BackupTestImage {
    private BackupTestImage() {}

    static final ImageFromDockerfile IMAGE = image();

    private static ImageFromDockerfile image() {
        var image = new ImageFromDockerfile();
        for (String file : List.of("Dockerfile", "backup.sh", "restore-drill.sh", "backup-loop.sh",
                "backup-set.sh", "scheduled-backup.sh", "ledger-check.sql")) {
            image.withFileFromPath(file, Path.of("..", "ops", "backup", file).toAbsolutePath());
        }
        return image;
    }
}
