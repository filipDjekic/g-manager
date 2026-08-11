package com.game_manager.gm.notification;

import com.game_manager.gm.catalog.*; import com.game_manager.gm.common.security.Role; import com.game_manager.gm.events.*;
import com.game_manager.gm.order.*; import com.game_manager.gm.reservation.*; import com.game_manager.gm.user.*;
import java.math.BigDecimal; import java.time.*; import java.util.Map; import java.util.UUID; import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test; import org.springframework.beans.factory.annotation.Autowired; import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration; import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean; import org.springframework.context.annotation.Import; import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType; import org.springframework.security.crypto.password.PasswordEncoder; import org.springframework.test.context.ActiveProfiles; import org.springframework.test.web.servlet.*;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat; import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*; import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"app.notifications.email-enabled=true","app.notifications.max-delivery-attempts=2","app.notifications.initial-backoff-seconds=1"})
@AutoConfigureMockMvc @ActiveProfiles("test") @Import(NotificationIntegrationTest.Config.class)
class NotificationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired NotificationService service; @Autowired NotificationRepository notifications;
 @Autowired NotificationPreferenceRepository preferences; @Autowired NotificationDeliveryRepository deliveries; @Autowired NotificationDeliveryWorker worker;
 @Autowired UserRepository users; @Autowired ReservationRepository reservations; @Autowired OrderRepository orders; @Autowired CatalogRepository catalog;
 @Autowired PasswordEncoder encoder; @Autowired ObjectMapper mapper; @Autowired FailingEmail failingEmail;

 @Test void consumerDeduplicatesEscapesTemplatesScopesRecipientsAndSseRequiresAuth() throws Exception {
  User customer=user(Role.CUSTOMER);User employee=user(Role.EMPLOYEE);Reservation reservation=reservation(customer,employee);
  OutboxMessage message=message(DomainEventType.RESERVATION_STATUS_CHANGED,"RESERVATION",reservation.getId(),Map.of("status","<script>alert(1)</script>"));
  service.consume(message);service.consume(message);
  assertThat(notifications.findAll().stream().filter(n->n.getSourceEventId().equals(message.id()))).hasSize(2);
  String customerToken=login(customer);String employeeToken=login(employee);
  MvcResult customerPage=mvc.perform(get("/api/v1/notifications").header("Authorization",bearer(customerToken))).andExpect(status().isOk())
    .andExpect(jsonPath("$.unreadCount").value(1)).andExpect(jsonPath("$.notifications[0].body").value(org.hamcrest.Matchers.containsString("&lt;script&gt;")))
    .andExpect(jsonPath("$.notifications[0].action.kind").value("NAVIGATE")).andReturn();
  UUID id=UUID.fromString(mapper.readTree(customerPage.getResponse().getContentAsByteArray()).at("/notifications/0/id").asText());
  mvc.perform(get("/api/v1/notifications/{id}/open",id).header("Authorization",bearer(customerToken))).andExpect(status().isOk()).andExpect(jsonPath("$.action.url",org.hamcrest.Matchers.containsString("/my-reservations")));
  mvc.perform(get("/api/v1/notifications/{id}/open",id).header("Authorization",bearer(employeeToken))).andExpect(status().isNotFound());
  reservations.deleteById(reservation.getId());reservations.flush();
  mvc.perform(get("/api/v1/notifications/{id}/open",id).header("Authorization",bearer(customerToken))).andExpect(status().isNotFound());
  mvc.perform(put("/api/v1/notifications/preferences").header("Authorization",bearer(customerToken)).contentType(MediaType.APPLICATION_JSON)
    .content("{\"type\":\"SECURITY_SESSION_STARTED\",\"inAppEnabled\":false,\"emailEnabled\":false}"))
    .andExpect(status().isOk()).andExpect(jsonPath("$.mandatory").value(true)).andExpect(jsonPath("$.inAppEnabled").value(true)).andExpect(jsonPath("$.emailEnabled").value(true));
  mvc.perform(get("/api/v1/notifications/stream")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/notifications/stream").header("Authorization",bearer(customerToken))).andExpect(request().asyncStarted());
 }

 @Test void emailFailureRetriesThenMovesToDeadWithoutRemovingInAppNotification() {
  User customer=user(Role.CUSTOMER);Order order=new Order();order.setCustomerId(customer.getId());order.setStatus(OrderStatus.CREATED);order.setTotalPrice(BigDecimal.TEN);order=orders.saveAndFlush(order);
  NotificationPreference pref=new NotificationPreference();pref.setRecipientId(customer.getId());pref.setType(NotificationType.ORDER_CREATED);pref.setInAppEnabled(true);pref.setEmailEnabled(true);preferences.saveAndFlush(pref);
  service.consume(message(DomainEventType.ORDER_CREATED,"ORDER",order.getId(),Map.of("status","CREATED")));
  assertThat(notifications.findAll().stream().filter(n->n.getRecipientId().equals(customer.getId()))).isNotEmpty();
  worker.deliver();NotificationDeliveryAttempt attempt=deliveries.findFirstByNotificationRecipientId(customer.getId()).orElseThrow();
  assertThat(attempt.getStatus()).isEqualTo(DeliveryStatus.PENDING);attempt.setAvailableAt(Instant.EPOCH);deliveries.saveAndFlush(attempt);worker.deliver();
  assertThat(deliveries.findById(attempt.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.DEAD);assertThat(failingEmail.calls()).isEqualTo(2);
 }

 private OutboxMessage message(DomainEventType type,String aggregate,UUID id,Map<String,Object> payload){UUID eventId=UUID.randomUUID();DomainEvent event=new DomainEvent(eventId,type,1,aggregate,id,Instant.now(),eventId.toString(),payload);return new OutboxMessage(eventId,type.name(),1,aggregate,id,Instant.now(),eventId.toString(),mapper.writeValueAsString(event),1);}
 private User user(Role role){return users.saveAndFlush(new User(role+" Notify",role.name().toLowerCase()+UUID.randomUUID()+"@example.test",encoder.encode("StrongPass1!"),role,true,null));}
 private Reservation reservation(User customer,User employee){CatalogItem item=new CatalogItem();item.setName("Notify "+UUID.randomUUID());item.setType(ItemType.SERVICE);item.setPrice(BigDecimal.TEN);item.setDurationMinutes(60);item.setActive(true);item=catalog.saveAndFlush(item);Reservation r=new Reservation();r.setCustomerId(customer.getId());r.setEmployeeId(employee.getId());r.setServiceId(item.getId());r.setStartTime(Instant.now().plusSeconds(3600));r.setEndTime(Instant.now().plusSeconds(7200));r.setStatus(ReservationStatus.CONFIRMED);return reservations.saveAndFlush(r);}
 private String login(User user)throws Exception{MvcResult result=mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail()))).andExpect(status().isOk()).andReturn();return mapper.readTree(result.getResponse().getContentAsByteArray()).get("token").asText();}
 private String bearer(String token){return "Bearer "+token;}
 @TestConfiguration static class Config{@Bean @Primary FailingEmail failingEmail(){return new FailingEmail();}}
 static class FailingEmail implements EmailDeliveryAdapter{private final AtomicInteger calls=new AtomicInteger();public void deliver(String recipient,String title,String body){calls.incrementAndGet();throw new IllegalStateException("sandbox failure recipient@example.test");}int calls(){return calls.get();}}
}
