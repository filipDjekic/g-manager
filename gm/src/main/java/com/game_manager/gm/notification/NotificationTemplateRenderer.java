package com.game_manager.gm.notification;
import java.util.Map; import java.util.regex.Matcher; import java.util.regex.Pattern; import org.springframework.stereotype.Component;
@Component public class NotificationTemplateRenderer {
 private static final Pattern TOKEN=Pattern.compile("\\{\\{([a-zA-Z0-9_]+)}}");
 public String render(String template,Map<String,String> values){Matcher matcher=TOKEN.matcher(template);StringBuffer out=new StringBuffer();
  while(matcher.find()){String value=values.getOrDefault(matcher.group(1),"");matcher.appendReplacement(out,Matcher.quoteReplacement(escape(value)));}
  matcher.appendTail(out);return out.toString();}
 private String escape(String value){return value.replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]","").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");}
}
