package com.game_manager.gm.workflow.dto; import jakarta.validation.constraints.*; public record WorkflowCommentRequest(@NotBlank @Size(max=1000)String body){}
