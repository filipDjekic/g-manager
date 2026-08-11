package com.game_manager.gm.customer.dto;

import com.game_manager.gm.order.CustomerOrderHistory;
import com.game_manager.gm.reservation.CustomerReservationHistory;
import java.util.List;

public record CustomerDetailResponse(
        CustomerListItemResponse customer,
        List<CustomerReservationHistory> reservations,
        List<CustomerOrderHistory> orders) {}
