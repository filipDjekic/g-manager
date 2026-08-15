package com.game_manager.gm.resource;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface LocationRepository extends JpaRepository<Location,UUID>{List<Location> findAllByOrderByNameAsc();}
