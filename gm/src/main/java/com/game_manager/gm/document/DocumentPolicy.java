package com.game_manager.gm.document;
import com.game_manager.gm.common.error.ApplicationException; import com.game_manager.gm.common.security.*; import java.util.UUID; import org.springframework.http.HttpStatus; import org.springframework.stereotype.Component;
@Component public class DocumentPolicy {private final java.util.List<DocumentAccessExtension> extensions;public DocumentPolicy(java.util.List<DocumentAccessExtension> extensions){this.extensions=extensions;}
 public void require(String type,UUID resource,AuthenticatedUser actor){boolean allowed=switch(type){case "USER_AVATAR","GENERAL","REPORT_OUTPUT"->resource.equals(actor.id());case "CATALOG_IMAGE"->RolePermissions.has(actor.role(),Permission.CATALOG_MANAGE);default->extensions.stream().filter(e->e.resourceType().equals(type)).anyMatch(e->e.allowed(resource,actor));};if(!allowed)throw new ApplicationException(HttpStatus.NOT_FOUND,"Document not found");}
}
