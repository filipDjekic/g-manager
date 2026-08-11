package com.game_manager.gm.customer.crm.dto;import java.util.*;
public record CustomerCrmResponse(UUID customerId,Long version,List<CrmNoteResponse> notes,List<String> tags){}
