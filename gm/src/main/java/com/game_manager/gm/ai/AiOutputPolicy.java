package com.game_manager.gm.ai;
import java.util.regex.Pattern;import org.springframework.stereotype.Component;
@Component public class AiOutputPolicy {private static final Pattern EMAIL=Pattern.compile("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}",Pattern.CASE_INSENSITIVE);private static final Pattern INJECTION=Pattern.compile("ignore (all |any )?(previous|prior)|system prompt|<script|authorization:|api[-_ ]?key",Pattern.CASE_INSENSITIVE);
 public void validate(String summary,String limitations){String combined=summary+" "+limitations;if(summary.isBlank()||limitations.isBlank()||summary.length()>2000||limitations.length()>1000||EMAIL.matcher(combined).find()||INJECTION.matcher(combined).find())throw new AiProviderException("AI output failed safety validation");}}
