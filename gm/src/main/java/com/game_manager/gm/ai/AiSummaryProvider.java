package com.game_manager.gm.ai;

public interface AiSummaryProvider {
    Result summarize(Input input);

    record Input(String promptVersion, String reportDefinition, long rowCount, String snapshotAt,
                 int maxOutputTokens) {}
    record Result(String summary, String limitations, int inputTokens, int outputTokens) {}
}
