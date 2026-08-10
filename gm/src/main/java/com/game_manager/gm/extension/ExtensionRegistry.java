package com.game_manager.gm.extension;
import java.util.*; import org.springframework.stereotype.Component;
@Component public class ExtensionRegistry {private final Map<String,ReportExtension> reports;private final Map<String,NotificationExtension> notifications;
 public ExtensionRegistry(List<ReportExtension> reportExtensions,List<NotificationExtension> notificationExtensions){reports=index(reportExtensions);notifications=index(notificationExtensions);}
 public Collection<ReportExtension> reports(){return reports.values();}public Collection<NotificationExtension> notifications(){return notifications.values();}
 private static <T> Map<String,T> index(List<T> values){Map<String,T> result=new LinkedHashMap<>();for(T value:values){String id=value instanceof ReportExtension r?r.id():((NotificationExtension)value).id();if(id==null||id.isBlank()||result.putIfAbsent(id,value)!=null)throw new IllegalStateException("Extension ids must be non-empty and unique: "+id);}return Map.copyOf(result);}}
