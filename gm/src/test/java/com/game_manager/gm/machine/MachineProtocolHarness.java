package com.game_manager.gm.machine;

import java.net.URI;import java.net.http.*;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.*;import tools.jackson.databind.*;

/** Headless Stage 7 protocol client. It never uses employee credentials. */
public final class MachineProtocolHarness {
    public interface PrivateKeyStore { void store(UUID identityId, PrivateKey key); PrivateKey require(UUID identityId); }
    public static final class InMemoryPrivateKeyStore implements PrivateKeyStore {
        private final Map<UUID,PrivateKey> values=new HashMap<>();public void store(UUID id,PrivateKey key){values.put(id,key);}public PrivateKey require(UUID id){return Objects.requireNonNull(values.get(id));}
    }
    private final HttpClient http=HttpClient.newHttpClient();private final URI base;private final ObjectMapper json=new ObjectMapper();private final PrivateKeyStore keys;
    private UUID identityId;private String accessToken;private long cursor;
    public MachineProtocolHarness(URI base,PrivateKeyStore keys){this.base=base;this.keys=keys;}

    public UUID enroll(String enrollmentToken,String clientVersion)throws Exception{KeyPairGenerator generator=KeyPairGenerator.getInstance("Ed25519");KeyPair pair=generator.generateKeyPair();String body=json.writeValueAsString(Map.of("enrollmentToken",enrollmentToken,"publicKeyBase64",Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),"clientVersion",clientVersion));JsonNode response=post("/machine/enroll",body,null,201);identityId=UUID.fromString(response.get("identityId").asText());keys.store(identityId,pair.getPrivate());return identityId;}
    public void authenticate()throws Exception{JsonNode challenge=post("/machine/auth/challenge",json.writeValueAsString(Map.of("identityId",identityId)),null,200);String nonce=challenge.get("nonce").asText();UUID challengeId=UUID.fromString(challenge.get("challengeId").asText());String value=challengeId+":"+identityId+":"+nonce;Signature signature=Signature.getInstance("Ed25519");signature.initSign(keys.require(identityId));signature.update(value.getBytes(StandardCharsets.UTF_8));JsonNode token=post("/machine/auth/token",json.writeValueAsString(Map.of("identityId",identityId,"challengeId",challengeId,"nonce",nonce,"signature",Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign()))),null,200);accessToken=token.get("token").asText();}
    public JsonNode snapshot()throws Exception{return get("/machine/snapshot");}
    public List<JsonNode> poll()throws Exception{JsonNode values=get("/machine/commands?afterSequence="+cursor);List<JsonNode> result=new ArrayList<>();values.forEach(result::add);return result;}
    public void acknowledge(long sequence)throws Exception{post("/machine/commands/"+sequence+"/ack","{}",accessToken,200);cursor=Math.max(cursor,sequence);}
    public void heartbeat(String version,String status)throws Exception{post("/machine/heartbeat",json.writeValueAsString(Map.of("clientVersion",version,"status",status,"lastCommandSequence",cursor)),accessToken,204);}
    private JsonNode get(String path)throws Exception{return send(HttpRequest.newBuilder(resolve(path)).header("Authorization","Bearer "+accessToken).GET().build(),200);}
    private JsonNode post(String path,String body,String token,int status)throws Exception{HttpRequest.Builder request=HttpRequest.newBuilder(resolve(path)).header("Content-Type","application/json");if(token!=null)request.header("Authorization","Bearer "+token);return send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(),status);}
    private URI resolve(String path){return base.resolve(path.startsWith("/")?path.substring(1):path);}
    private JsonNode send(HttpRequest request,int expected)throws Exception{HttpResponse<String> response=http.send(request,HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=expected)throw new IllegalStateException("Machine protocol returned "+response.statusCode());return json.readTree(response.body().isBlank()?"{}":response.body());}
}
