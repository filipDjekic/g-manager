package com.game_manager.gm.ai;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class HttpAiSummaryProvider implements AiSummaryProvider {
    private final AiProperties config; private final ObjectMapper mapper; private final Clock clock; private final AiOutputPolicy outputPolicy;
    private final HttpClient client; private int failures; private Instant openUntil = Instant.EPOCH;

    public HttpAiSummaryProvider(AiProperties config, ObjectMapper mapper, Clock clock, AiOutputPolicy outputPolicy) {
        this.config=config; this.mapper=mapper; this.clock=clock; this.outputPolicy=outputPolicy;
        this.client=HttpClient.newBuilder().connectTimeout(Duration.ofMillis(config.timeoutMillis())).build();
    }

    @Override public synchronized Result summarize(Input input) {
        if (!"http".equalsIgnoreCase(config.provider()) || config.endpoint()==null || config.apiKey()==null || config.apiKey().isBlank())
            throw new AiProviderException("AI provider is not configured");
        if (openUntil.isAfter(clock.instant())) throw new AiProviderException("AI provider circuit is open");
        try {
            String body=mapper.writeValueAsString(java.util.Map.of("model",config.model(),
                    "task","Summarize only the supplied report metadata; do not infer facts or actions.",
                    "input",input,"responseFormat","json"));
            HttpRequest request=HttpRequest.newBuilder(config.endpoint()).timeout(Duration.ofMillis(config.timeoutMillis()))
                    .header("Authorization","Bearer "+config.apiKey()).header("Content-Type","application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response=client.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()/100!=2)throw new AiProviderException("AI provider returned status "+response.statusCode());
            JsonNode json=mapper.readTree(response.body()); String summary=text(json,"summary"),limitations=text(json,"limitations");
            int inputTokens=integer(json,"inputTokens"),outputTokens=integer(json,"outputTokens");
            if(summary.isBlank()||limitations.isBlank()||inputTokens<0||inputTokens>config.maxInputTokens()||outputTokens<0||outputTokens>input.maxOutputTokens())
                throw new AiProviderException("AI provider response does not match the required schema");
            outputPolicy.validate(summary,limitations);
            failures=0; return new Result(summary,limitations,inputTokens,outputTokens);
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return failed(e); }
        catch (Exception e) { return failed(e); }
    }
    private Result failed(Exception exception){failures++;if(failures>=config.circuitFailureThreshold()){openUntil=clock.instant().plusSeconds(config.circuitOpenSeconds());failures=0;}throw exception instanceof AiProviderException value?value:new AiProviderException("AI provider request failed",exception);}
    private static String text(JsonNode value,String key){JsonNode node=value.get(key);return node==null?"":node.asText("").trim();}
    private static int integer(JsonNode value,String key){JsonNode node=value.get(key);return node==null?-1:node.asInt(-1);}
}
