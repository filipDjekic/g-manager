package com.game_manager.gm.machine;
import java.util.UUID;import org.springframework.data.jpa.repository.JpaRepository;
public interface StationHeartbeatRepository extends JpaRepository<StationHeartbeat,UUID>{}
