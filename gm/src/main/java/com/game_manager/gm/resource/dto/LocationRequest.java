package com.game_manager.gm.resource.dto;
import jakarta.validation.constraints.*;
public record LocationRequest(@NotBlank @Size(max=40) String code,@NotBlank @Size(max=120) String name,@NotBlank @Size(max=255) String address,@Size(max=500) String description,@NotBlank @Size(max=60) String timezone,boolean active,Long version){}
