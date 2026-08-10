package com.game_manager.gm.common.security;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public final class RolePermissions {
    private static final Set<Permission> PROFILE = EnumSet.of(
            Permission.PROFILE_READ, Permission.PROFILE_UPDATE,
            Permission.CATALOG_READ, Permission.WORKING_HOURS_READ,
            Permission.EMPLOYEE_LIST);
    private static final Map<Role, Set<Permission>> BY_ROLE = buildPermissions();

    private RolePermissions() {
    }

    public static Set<Permission> forRole(Role role) {
        return BY_ROLE.get(role);
    }

    public static boolean has(Role role, Permission permission) {
        return forRole(role).contains(permission);
    }

    private static Map<Role, Set<Permission>> buildPermissions() {
        EnumMap<Role, Set<Permission>> permissions = new EnumMap<>(Role.class);
        permissions.put(Role.CUSTOMER, immutableWithProfile(
                Permission.RESERVATION_CREATE, Permission.RESERVATION_READ_OWN,
                Permission.RESERVATION_CHANGE_STATUS, Permission.ORDER_CREATE,
                Permission.ORDER_READ_OWN, Permission.ORDER_CHANGE_STATUS));
        permissions.put(Role.EMPLOYEE, immutableWithProfile(
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_OPERATIONAL, Permission.REPORT_READ,
                Permission.WORKFLOW_SUBMIT));
        permissions.put(Role.ADMIN, immutableWithProfile(
                Permission.USER_LIST, Permission.USER_CREATE, Permission.USER_DEACTIVATE,
                Permission.USER_DELETE, Permission.USER_RESTORE,
                Permission.CATALOG_MANAGE, Permission.CATALOG_DELETE, Permission.CATALOG_RESTORE,
                Permission.AUDIT_READ, Permission.WORKING_HOURS_MANAGE,
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_SUMMARY, Permission.DASHBOARD_OPERATIONAL,
                Permission.METRICS_READ, Permission.REPORT_READ, Permission.REPORT_MANAGE,
                Permission.WORKFLOW_ACT, Permission.WORKFLOW_MANAGE));
        permissions.put(Role.OWNER, immutableWithProfile(
                Permission.USER_LIST, Permission.USER_CREATE, Permission.USER_DEACTIVATE,
                Permission.USER_DELETE, Permission.USER_RESTORE,
                Permission.CATALOG_MANAGE, Permission.CATALOG_DELETE, Permission.CATALOG_RESTORE,
                Permission.AUDIT_READ, Permission.WORKING_HOURS_MANAGE,
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_SUMMARY, Permission.DASHBOARD_OPERATIONAL,
                Permission.METRICS_READ, Permission.REPORT_READ, Permission.REPORT_MANAGE,
                Permission.WORKFLOW_ACT, Permission.WORKFLOW_MANAGE));
        return Map.copyOf(permissions);
    }

    private static Set<Permission> immutableWithProfile(Permission... additional) {
        EnumSet<Permission> result = EnumSet.copyOf(PROFILE);
        result.addAll(Set.of(additional));
        return Set.copyOf(result);
    }
}
