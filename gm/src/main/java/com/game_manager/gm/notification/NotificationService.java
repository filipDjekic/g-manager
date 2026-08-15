package com.game_manager.gm.notification;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.search.SearchSource;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.web.NavigationActionResponse;
import com.game_manager.gm.events.OutboxConsumer;
import com.game_manager.gm.events.OutboxMessage;
import com.game_manager.gm.notification.dto.*;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.user.UserService;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class NotificationService implements OutboxConsumer {
    private final NotificationRepository notifications; private final NotificationPreferenceRepository preferences;
    private final NotificationTemplateRepository templates; private final NotificationDeliveryRepository deliveries;
    private final ReservationService reservationService; private final OrderService orderService; private final UserService userService;
    private final CurrentUserProvider currentUser; private final NotificationTemplateRenderer renderer; private final NotificationRealtimeHub realtime;
    private final Map<SearchResourceType, SearchSource> searchSources=new EnumMap<>(SearchResourceType.class);
    private final ObjectMapper mapper; private final Clock clock; private final MeterRegistry metrics; private final GManagerProperties.Notifications config;

    public NotificationService(NotificationRepository notifications,NotificationPreferenceRepository preferences,
            NotificationTemplateRepository templates,NotificationDeliveryRepository deliveries,ReservationService reservationService,
            OrderService orderService,UserService userService,CurrentUserProvider currentUser,NotificationTemplateRenderer renderer,
            NotificationRealtimeHub realtime,List<SearchSource> sources,ObjectMapper mapper,Clock clock,MeterRegistry metrics,GManagerProperties properties){
        this.notifications=notifications;this.preferences=preferences;this.templates=templates;this.deliveries=deliveries;
        this.reservationService=reservationService;this.orderService=orderService;this.userService=userService;this.currentUser=currentUser;
        this.renderer=renderer;this.realtime=realtime;sources.forEach(s->searchSources.put(s.type(),s));this.mapper=mapper;this.clock=clock;this.metrics=metrics;this.config=properties.notifications();}

    @Override public String name(){return "notification-projector-v1";}
    @Override @Transactional public void consume(OutboxMessage message){
        NotificationType type=mapType(message.eventType()); if(type==null)return;
        Map<String,String> values=payload(message.payload());
        for(Recipient recipient:recipients(type,message.aggregateId())) create(message,type,recipient,values);
    }

    @Transactional(readOnly=true) public NotificationPageResponse list(){AuthenticatedUser actor=currentUser.requireCurrentUser();UUID recipient=actor.id();
        return new NotificationPageResponse(notifications.findByRecipientIdAndInAppVisibleTrueOrderByCreatedAtDescIdDesc(recipient,PageRequest.of(0,50)).stream().map(n->response(actor,n)).toList(),
                notifications.countByRecipientIdAndInAppVisibleTrueAndReadAtIsNull(recipient));}
    @Transactional(readOnly=true) public List<NotificationResponse> attentionBetween(Instant from,Instant to,int limit){AuthenticatedUser actor=currentUser.requireCurrentUser();
        return notifications.attentionBetween(actor.id(),from,to,PageRequest.of(0,limit)).stream().map(n->response(actor,n)).toList();}
    @Transactional public NotificationResponse read(UUID id){AuthenticatedUser actor=currentUser.requireCurrentUser();Notification n=require(id,actor.id());if(n.getReadAt()==null)n.setReadAt(clock.instant());return response(actor,n);}
    @Transactional public void readAll(){UUID recipient=currentUser.requireCurrentUser().id();notifications.findByRecipientIdAndInAppVisibleTrueOrderByCreatedAtDescIdDesc(recipient,PageRequest.of(0,200))
            .stream().filter(n->n.getReadAt()==null).forEach(n->n.setReadAt(clock.instant()));}
    @Transactional(readOnly=true) public NotificationOpenResponse open(UUID id){AuthenticatedUser actor=currentUser.requireCurrentUser();Notification n=require(id,actor.id());
        NavigationActionResponse action=action(actor,n).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Notification resource is no longer available"));return new NotificationOpenResponse(action);}

    @Transactional(readOnly=true) public List<NotificationPreferenceResponse> preferenceList(){UUID id=currentUser.requireCurrentUser().id();Map<NotificationType,NotificationPreference> stored=new EnumMap<>(NotificationType.class);
        preferences.findByRecipientIdOrderByType(id).forEach(p->stored.put(p.getType(),p));return Arrays.stream(NotificationType.values()).map(type->preferenceResponse(type,stored.get(type))).toList();}
    @Transactional public NotificationPreferenceResponse savePreference(NotificationPreferenceRequest request){UUID id=currentUser.requireCurrentUser().id();NotificationType type=request.type();
        NotificationPreference value=preferences.findByRecipientIdAndType(id,type).orElseGet(NotificationPreference::new);value.setRecipientId(id);value.setType(type);
        value.setInAppEnabled(type.mandatory()||request.inAppEnabled());value.setEmailEnabled(type.mandatory()||request.emailEnabled());preferences.save(value);return preferenceResponse(type,value);}

    @Transactional(readOnly=true) public SseEmitter connect(String lastEventId){UUID id=currentUser.requireCurrentUser().id();SseEmitter emitter=realtime.connect(id,config.sseTimeoutSeconds()*1000);
        if(lastEventId!=null&&!lastEventId.isBlank())try{UUID last=UUID.fromString(lastEventId);notifications.findByIdAndRecipientId(last,id).ifPresent(cursor->
            notifications.replayAfter(id,cursor.getCreatedAt(),cursor.getId(),PageRequest.of(0,100)).stream().filter(Notification::isInAppVisible).forEach(n->send(emitter,n)));
        }catch(IllegalArgumentException ignored){metrics.counter("gm.notification.sse.reconnects","outcome","invalid_cursor").increment();}
        metrics.counter("gm.notification.sse.reconnects","outcome",lastEventId==null?"initial":"replay").increment();return emitter;}

    @Scheduled(cron="0 15 3 * * *") @Transactional public void retention(){notifications.deleteByReadAtBefore(clock.instant().minus(config.retentionDays(),ChronoUnit.DAYS));}
    @Transactional public void reportCompleted(UUID owner,UUID reportId,String definition){if(notifications.existsBySourceEventIdAndRecipientIdAndType(reportId,owner,NotificationType.REPORT_COMPLETED))return;Notification n=new Notification();n.setSourceEventId(reportId);n.setRecipientId(owner);n.setType(NotificationType.REPORT_COMPLETED);n.setPriority(NotificationPriority.NORMAL);n.setTitle("Izveštaj je spreman");n.setBody("Izveštaj "+definition+" je generisan i spreman za preuzimanje.");n.setDeepLink("/reports");n.setInAppVisible(true);notifications.saveAndFlush(n);metrics.counter("gm.notification.created","type",NotificationType.REPORT_COMPLETED.name()).increment();afterCommit(()->realtime.send(owner,NotificationResponse.from(n)));}
    @Transactional public void waitlistOffer(UUID customer,UUID offerId){if(notifications.existsBySourceEventIdAndRecipientIdAndType(offerId,customer,NotificationType.WAITLIST_OFFERED))return;Notification n=new Notification();n.setSourceEventId(offerId);n.setRecipientId(customer);n.setType(NotificationType.WAITLIST_OFFERED);n.setPriority(NotificationPriority.HIGH);n.setTitle("Termin je dostupan");n.setBody("Termin sa liste čekanja je dostupan do isteka ponude.");n.setDeepLink("/my-reservations?waitlistOffer="+offerId);n.setInAppVisible(true);notifications.saveAndFlush(n);metrics.counter("gm.notification.created","type",NotificationType.WAITLIST_OFFERED.name()).increment();afterCommit(()->realtime.send(customer,NotificationResponse.from(n)));}

    private void create(OutboxMessage message,NotificationType type,Recipient recipient,Map<String,String> values){if(recipient.id()==null||userService.activeEmail(recipient.id()).isEmpty())return;
        if(notifications.existsBySourceEventIdAndRecipientIdAndType(message.id(),recipient.id(),type))return;
        NotificationPreference pref=preferences.findByRecipientIdAndType(recipient.id(),type).orElse(null);boolean inApp=type.mandatory()||pref==null||pref.isInAppEnabled();boolean email=type.mandatory()||(pref!=null&&pref.isEmailEnabled());if(!inApp&&!email)return;
        NotificationTemplate template=templates.findByTypeAndLocale(type,"sr").orElseThrow(()->new IllegalStateException("Notification template missing: "+type));
        Notification n=new Notification();n.setSourceEventId(message.id());n.setRecipientId(recipient.id());n.setType(type);n.setPriority(type.mandatory()?NotificationPriority.HIGH:NotificationPriority.NORMAL);
        n.setTitle(renderer.render(template.getTitleTemplate(),values));n.setBody(renderer.render(template.getBodyTemplate(),values));n.setResourceType(recipient.resourceType());n.setResourceId(message.aggregateId());n.setDeepLink(recipient.link());n.setInAppVisible(inApp);notifications.saveAndFlush(n);
        if(email&&config.emailEnabled()){NotificationDeliveryAttempt delivery=new NotificationDeliveryAttempt();delivery.setNotification(n);delivery.setChannel("EMAIL");delivery.setStatus(DeliveryStatus.PENDING);delivery.setAvailableAt(clock.instant());deliveries.save(delivery);}
        metrics.counter("gm.notification.created","type",type.name()).increment();if(inApp)afterCommit(()->realtime.send(recipient.id(),NotificationResponse.from(n)));
    }
    private List<Recipient> recipients(NotificationType type,UUID aggregateId){return switch(type){
        case SECURITY_SESSION_STARTED,SECURITY_PASSWORD_CHANGED->List.of(new Recipient(aggregateId,null,"/profile"));
        case RESERVATION_CREATED->reservationService.notificationContext(aggregateId).map(c->List.of(new Recipient(c.employeeId(),SearchResourceType.RESERVATION,"/reservations?focus="+aggregateId))).orElse(List.of());
        case RESERVATION_STATUS_CHANGED->reservationService.notificationContext(aggregateId).map(c->java.util.stream.Stream.of(c.customerId(),c.employeeId()).distinct().map(id->new Recipient(id,SearchResourceType.RESERVATION,"/my-reservations?focus="+aggregateId)).toList()).orElse(List.of());
        case ORDER_CREATED,ORDER_STATUS_CHANGED->orderService.notificationContext(aggregateId).map(c->List.of(new Recipient(c.customerId(),SearchResourceType.ORDER,"/my-orders?focus="+aggregateId))).orElse(List.of());case REPORT_COMPLETED,WORKFLOW_ACTION_REQUIRED,WORKFLOW_REMINDER,WORKFLOW_ESCALATED,WORKFLOW_COMPLETED,WAITLIST_OFFERED->List.of();};}
    private NotificationType mapType(String type){return switch(type){case "AUTH_SESSION_STARTED","SESSION_STARTED"->NotificationType.SECURITY_SESSION_STARTED;case "USER_PASSWORD_CHANGED"->NotificationType.SECURITY_PASSWORD_CHANGED;
        case "RESERVATION_CREATED"->NotificationType.RESERVATION_CREATED;case "RESERVATION_STATUS_CHANGED"->NotificationType.RESERVATION_STATUS_CHANGED;case "ORDER_CREATED"->NotificationType.ORDER_CREATED;case "ORDER_STATUS_CHANGED"->NotificationType.ORDER_STATUS_CHANGED;default->null;};}
    private Map<String,String> payload(String json){try{JsonNode node=mapper.readTree(json).path("payload");Map<String,String> values=new HashMap<>();node.properties().forEach(entry->values.put(entry.getKey(),entry.getValue().asText()));return values;}catch(RuntimeException e){throw new IllegalArgumentException("Notification event payload is invalid",e);}}
    private Notification require(UUID id,UUID recipient){return notifications.findByIdAndRecipientId(id,recipient).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Notification not found"));}
    private NotificationPreferenceResponse preferenceResponse(NotificationType type,NotificationPreference value){return new NotificationPreferenceResponse(type,type.mandatory(),type.mandatory()||value==null||value.isInAppEnabled(),type.mandatory()||(value!=null&&value.isEmailEnabled()));}
    private NotificationResponse response(AuthenticatedUser actor,Notification n){return NotificationResponse.from(n,action(actor,n).orElse(null));}
    private Optional<NavigationActionResponse> action(AuthenticatedUser actor,Notification n){
        if(n.getResourceType()==null)return Optional.ofNullable(n.getDeepLink()).filter(link->!link.isBlank()).map(link->NavigationActionResponse.navigate("Otvori",link));
        SearchSource source=searchSources.get(n.getResourceType());return source==null?Optional.empty():source.findVisible(actor,n.getResourceId()).map(entry->NavigationActionResponse.forResource(n.getResourceType(),entry.url()));}
    private void send(SseEmitter emitter,Notification n){try{emitter.send(SseEmitter.event().id(n.getId().toString()).name("notification").data(NotificationResponse.from(n)));}catch(Exception ignored){emitter.complete();}}
    private void afterCommit(Runnable action){if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){action.run();}});else action.run();}
    private record Recipient(UUID id,SearchResourceType resourceType,String link){}
}
