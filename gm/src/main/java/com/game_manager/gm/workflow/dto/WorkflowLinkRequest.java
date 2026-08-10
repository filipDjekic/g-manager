package com.game_manager.gm.workflow.dto; import jakarta.validation.constraints.NotNull; import java.util.UUID; public record WorkflowLinkRequest(@NotNull UUID documentId){}
