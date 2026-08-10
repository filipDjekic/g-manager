package com.game_manager.gm.media;
import com.game_manager.gm.common.security.CurrentUserProvider; import com.game_manager.gm.document.DocumentService; import java.util.UUID; import org.springframework.stereotype.Service; import org.springframework.web.multipart.MultipartFile;
@Service public class LocalFileStorageService implements FileStorageService {
 private final DocumentService documents; private final CurrentUserProvider users; public LocalFileStorageService(DocumentService documents,CurrentUserProvider users){this.documents=documents;this.users=users;}
 public String storeAvatar(MultipartFile file){return url(documents.upload("USER_AVATAR",users.requireCurrentUser().id(),file));}
 public String storeCatalogImage(UUID id,MultipartFile file){return url(documents.upload("CATALOG_IMAGE",id,file));}
 private static String url(com.game_manager.gm.document.dto.DocumentResponse d){return "/api/v1/documents/"+d.id()+"/content?preview=true";}
}
