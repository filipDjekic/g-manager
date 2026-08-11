package com.game_manager.gm.customer.crm.dto;import jakarta.validation.constraints.*;
public record CrmTagRequest(@NotBlank @Size(max=60) String name){}
