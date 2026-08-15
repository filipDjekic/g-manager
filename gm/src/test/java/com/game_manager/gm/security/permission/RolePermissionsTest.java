package com.game_manager.gm.security.permission;

import static org.assertj.core.api.Assertions.assertThat;

import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.RolePermissions;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RolePermissionsTest {
    @Test
    void everyRoleHasAnExplicitImmutablePermissionSet() {
        assertThat(RolePermissions.forRole(Role.CUSTOMER)).containsExactlyInAnyOrder(
                Permission.PROFILE_READ, Permission.PROFILE_UPDATE, Permission.EMPLOYEE_LIST,
                Permission.CATALOG_READ, Permission.WORKING_HOURS_READ,
                Permission.RESOURCE_READ,
                Permission.RESERVATION_CREATE, Permission.RESERVATION_READ_OWN,
                Permission.RESERVATION_CHANGE_STATUS, Permission.ORDER_CREATE,
                Permission.ORDER_READ_OWN, Permission.ORDER_CHANGE_STATUS);
        assertThat(RolePermissions.forRole(Role.EMPLOYEE))
                .contains(Permission.RESERVATION_READ_ALL, Permission.ORDER_READ_ALL,
                        Permission.DASHBOARD_OPERATIONAL, Permission.RESOURCE_READ,
                        Permission.CUSTOMER_READ, Permission.CUSTOMER_CREATE,
                        Permission.CUSTOMER_UPDATE_LIMITED, Permission.CUSTOMER_DEACTIVATE,
                        Permission.STATION_READ, Permission.GAMING_SESSION_READ,
                        Permission.GAMING_SESSION_START, Permission.GAMING_SESSION_EXTEND,
                        Permission.GAMING_SESSION_TERMINATE)
                .doesNotContain(Permission.USER_LIST, Permission.DASHBOARD_SUMMARY);
        assertThat(RolePermissions.forRole(Role.ADMIN))
                .contains(Permission.USER_LIST, Permission.USER_CREATE,
                        Permission.CATALOG_MANAGE, Permission.DASHBOARD_SUMMARY,
                        Permission.RESOURCE_READ, Permission.RESOURCE_MANAGE,
                        Permission.CUSTOMER_CREATE, Permission.CUSTOMER_UPDATE_LIMITED,
                        Permission.CUSTOMER_DEACTIVATE, Permission.STATION_READ,
                        Permission.STATION_MAINTENANCE, Permission.APPLICATION_PROFILE_MANAGE)
                .doesNotContain(Permission.ORDER_CREATE, Permission.RESERVATION_CREATE);
        assertThat(RolePermissions.forRole(Role.OWNER))
                .containsAll(RolePermissions.forRole(Role.ADMIN));
        assertThatThrownByMutation(RolePermissions.forRole(Role.CUSTOMER));
    }

    private void assertThatThrownByMutation(Set<Permission> permissions) {
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> permissions.add(Permission.USER_LIST))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
