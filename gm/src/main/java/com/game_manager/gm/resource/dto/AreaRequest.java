package com.game_manager.gm.resource.dto;
import jakarta.validation.constraints.*;
public record AreaRequest(@NotBlank @Size(max=40) String code,@NotBlank @Size(max=120) String name,@Size(max=500) String description,boolean active,@Positive int mapWidth,@Positive int mapHeight,int displayOrder,Long version){}
