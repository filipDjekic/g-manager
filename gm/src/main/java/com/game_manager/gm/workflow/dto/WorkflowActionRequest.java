package com.game_manager.gm.workflow.dto; import jakarta.validation.constraints.*; public record WorkflowActionRequest(@NotBlank String action,@Size(max=500)String reason,@NotNull Long version){}
