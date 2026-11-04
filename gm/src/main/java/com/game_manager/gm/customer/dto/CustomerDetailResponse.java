package com.game_manager.gm.customer.dto;

/** Profile summary; reservation and order histories are separate paginated resources. */
public record CustomerDetailResponse(CustomerListItemResponse customer) {}
