package com.game_manager.gm.resource;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AreaRepository extends JpaRepository<Area,UUID>{List<Area> findByLocationIdOrderByDisplayOrderAscNameAsc(UUID locationId);}
