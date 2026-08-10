package com.game_manager.gm.extension;
import java.util.Map;
public interface NotificationExtension { String id(); String version(); Map<String,String> enrich(ReadOnlyNotificationContext context); record ReadOnlyNotificationContext(String eventType,Map<String,String> metadata){} }
