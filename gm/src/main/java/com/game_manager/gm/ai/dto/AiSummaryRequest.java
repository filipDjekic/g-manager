package com.game_manager.gm.ai.dto;
import jakarta.validation.constraints.AssertTrue;
public record AiSummaryRequest(@AssertTrue(message="Explicit AI processing consent is required") boolean consent) {}
