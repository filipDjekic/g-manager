package com.game_manager.gm.jobs;

public interface JobHandler {
    String type();

    void handle(JobRecord job, JobContext context);
}
