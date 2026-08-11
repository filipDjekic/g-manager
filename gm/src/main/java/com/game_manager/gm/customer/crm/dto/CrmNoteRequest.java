package com.game_manager.gm.customer.crm.dto;import jakarta.validation.constraints.*;
public record CrmNoteRequest(@NotBlank @Size(max=1000) String body,Long version){}
