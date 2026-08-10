package com.game_manager.gm.jobs;

public class JobCancelledException extends RuntimeException {
    public JobCancelledException() {
        super("Job cancellation was requested");
    }
}
