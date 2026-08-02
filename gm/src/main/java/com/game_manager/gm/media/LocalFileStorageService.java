package com.game_manager.gm.media;

import com.game_manager.gm.common.error.ApplicationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
public class LocalFileStorageService implements FileStorageService {
    private static final long MAX_SIZE = 5L * 1024 * 1024;
    private final Path avatarRoot;

    public LocalFileStorageService(@Value("${app.storage.local-root:data/uploads}") String root) {
        this.avatarRoot = Path.of(root).toAbsolutePath().normalize().resolve("avatars");
    }

    @Override
    public String storeAvatar(MultipartFile file) {
        return storeImage(file, "avatars");
    }

    @Override
    public String storeCatalogImage(MultipartFile file) {
        return storeImage(file, "catalog");
    }

    private String storeImage(MultipartFile file, String directory) {
        ImageType type = validate(file);
        try {
            Path imageRoot = avatarRoot.getParent().resolve(directory).normalize();
            Files.createDirectories(imageRoot);
            String filename = UUID.randomUUID() + type.extension;
            Path target = imageRoot.resolve(filename).normalize();
            if (!target.getParent().equals(imageRoot)) {
                throw new ApplicationException(HttpStatus.BAD_REQUEST, "Invalid file path");
            }
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            return "/media/" + directory + "/" + filename;
        } catch (IOException exception) {
            throw new ApplicationException(HttpStatus.INTERNAL_SERVER_ERROR, "Avatar could not be stored");
        }
    }

    private ImageType validate(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_SIZE) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Avatar must be a non-empty image up to 5 MB");
        }
        try {
            byte[] bytes = file.getBytes();
            if ("image/png".equals(file.getContentType()) && isPng(bytes)) return ImageType.PNG;
            if ("image/jpeg".equals(file.getContentType()) && isJpeg(bytes)) return ImageType.JPEG;
        } catch (IOException exception) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Avatar could not be read");
        }
        throw new ApplicationException(HttpStatus.BAD_REQUEST, "Only genuine PNG and JPEG images are allowed");
    }

    private boolean isPng(byte[] b) {
        byte[] signature = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        if (b.length < signature.length) return false;
        for (int i = 0; i < signature.length; i++) if (b[i] != signature[i]) return false;
        return true;
    }

    private boolean isJpeg(byte[] b) {
        return b.length >= 3 && b[0] == (byte) 0xff && b[1] == (byte) 0xd8 && b[2] == (byte) 0xff;
    }

    private enum ImageType {
        PNG(".png"), JPEG(".jpg");
        private final String extension;
        ImageType(String extension) { this.extension = extension; }
    }
}
