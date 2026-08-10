package com.game_manager.gm.media;

import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {
    String storeAvatar(MultipartFile file);
    String storeCatalogImage(java.util.UUID catalogId, MultipartFile file);
}
