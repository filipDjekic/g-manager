package com.game_manager.gm.dashboard;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
interface DashboardWidgetPreferenceRepository extends JpaRepository<DashboardWidgetPreference, UUID> {
    List<DashboardWidgetPreference> findByOwnerIdOrderByPositionAsc(UUID ownerId);
    Optional<DashboardWidgetPreference> findByOwnerIdAndWidgetKey(UUID ownerId, String widgetKey);
}
