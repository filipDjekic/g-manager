package com.game_manager.gm.order;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OrderAuthorizationPolicy {
    private final AuthorizationDenialLogger denialLogger;

    public void requireTransition(AuthenticatedUser actor, Order order, OrderStatus target) {
        boolean management = actor.role() == Role.ADMIN || actor.role() == Role.OWNER;
        boolean employee = actor.role() == Role.EMPLOYEE;
        boolean handler = employee && actor.id().equals(order.getHandledBy());
        boolean customerOwner = actor.role() == Role.CUSTOMER
                && actor.id().equals(order.getCustomerId());
        boolean permitted = switch (target) {
            case IN_PROGRESS -> employee || management;
            case READY, COMPLETED -> handler || management;
            case CANCELLED -> switch (order.getStatus()) {
                case CREATED -> customerOwner || employee || management;
                case IN_PROGRESS -> handler || management;
                case READY -> management;
                case COMPLETED, CANCELLED -> false;
            };
            case CREATED -> false;
        };
        if (!permitted) {
            denialLogger.denied(Permission.ORDER_CHANGE_STATUS, actor, "order", relation(actor, order));
            throw new ApplicationException(HttpStatus.FORBIDDEN, "This order action is not permitted");
        }
    }

    private String relation(AuthenticatedUser actor, Order order) {
        if (actor.id().equals(order.getCustomerId())) return "customer-owner";
        if (actor.id().equals(order.getHandledBy())) return "handler";
        return "unrelated";
    }
}
