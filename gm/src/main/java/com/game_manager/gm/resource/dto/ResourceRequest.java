package com.game_manager.gm.resource.dto;
import com.game_manager.gm.resource.ResourceType;
import jakarta.validation.constraints.*;
import java.util.UUID;
public record ResourceRequest(@NotNull UUID serviceId,@NotBlank @Size(max=40) String code,@NotBlank @Size(max=120) String name,@NotNull ResourceType type,@Size(max=500) String description,boolean active,boolean bookable,@Positive int capacity,int displayOrder,@PositiveOrZero int x,@PositiveOrZero int y,@Positive int width,@Positive int height,int rotation,Long version){}
