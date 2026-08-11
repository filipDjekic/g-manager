package com.game_manager.gm.reservation;
import java.util.UUID;import org.springframework.data.jpa.repository.JpaRepository;
interface RecurrenceSeriesRepository extends JpaRepository<RecurrenceSeries,UUID> {}
