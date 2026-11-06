package com.game_manager.gm.gamingsession;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.game_manager.gm.common.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
class GamingBillingIntegrationTest extends GamingSessionIntegrationTest {
 @Autowired com.game_manager.gm.security.JwtService jwt;
 @Test void archivedMoneyCreditCannotBuyNewTimeOrTariffPackages()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var pc=station();String token="Bearer "+jwt.issue(owner.getId()).value();
  String body="{\"resourceId\":\""+pc.resource().getId()+"\",\"payment\":{\"method\":\"CASH\",\"amount\":300},\"reason\":\"Old client\"}";
  mvc.perform(post("/api/v1/gaming-billing/customers/"+c.getId()+"/topups").header("Authorization",token).header("Idempotency-Key","old-topup").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isZero();
  mvc.perform(get("/api/v1/gaming-billing/tariffs").header("Authorization",token)).andExpect(status().isNotFound());
 }
 @Test void immediateGamingStartIsRetired()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var pc=station();
  mvc.perform(post("/api/v1/gaming-sessions").header("Authorization","Bearer "+jwt.issue(owner.getId()).value()).header("Idempotency-Key","old-start").contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":\""+c.getId()+"\",\"resourceId\":\""+pc.resource().getId()+"\"}")).andExpect(status().isMethodNotAllowed());
  assertThat(sessions.count()).isZero();
 }
}
