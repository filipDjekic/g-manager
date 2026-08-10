package com.game_manager.gm.document;
import com.game_manager.gm.common.error.ApplicationException; import com.game_manager.gm.common.security.*; import java.util.UUID; import org.springframework.http.HttpStatus; import org.springframework.stereotype.Component;
@Component public class DocumentPolicy {
 public void require(String type,UUID resource,AuthenticatedUser actor){boolean allowed=switch(type){case "USER_AVATAR","GENERAL"->resource.equals(actor.id());case "CATALOG_IMAGE"->RolePermissions.has(actor.role(),Permission.CATALOG_MANAGE);default->false;};if(!allowed)throw new ApplicationException(HttpStatus.NOT_FOUND,"Document not found");}
}
