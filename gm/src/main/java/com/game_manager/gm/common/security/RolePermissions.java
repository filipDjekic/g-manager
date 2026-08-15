package com.game_manager.gm.common.security;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public final class RolePermissions {
    private static final Set<Permission> PROFILE = EnumSet.of(
            Permission.PROFILE_READ, Permission.PROFILE_UPDATE,
            Permission.CATALOG_READ, Permission.WORKING_HOURS_READ,
            Permission.EMPLOYEE_LIST, Permission.RESOURCE_READ);
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
                Permission.CUSTOMER_READ, Permission.CUSTOMER_CREATE,
                Permission.CUSTOMER_UPDATE_LIMITED, Permission.CUSTOMER_DEACTIVATE,
                Permission.STATION_READ,
                Permission.GAMING_SESSION_READ, Permission.GAMING_SESSION_START,
                Permission.GAMING_SESSION_EXTEND, Permission.GAMING_SESSION_TERMINATE,
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_OPERATIONAL, Permission.REPORT_READ,
                Permission.WORKFLOW_SUBMIT));
        permissions.put(Role.ADMIN, immutableWithProfile(
                Permission.USER_LIST, Permission.USER_CREATE, Permission.USER_DEACTIVATE,
                Permission.USER_DELETE, Permission.USER_RESTORE, Permission.CUSTOMER_READ,
                Permission.CUSTOMER_CREATE, Permission.CUSTOMER_UPDATE_LIMITED,
                Permission.CUSTOMER_DEACTIVATE,
                Permission.CUSTOMER_CRM_MANAGE,
                Permission.CATALOG_MANAGE, Permission.CATALOG_DELETE, Permission.CATALOG_RESTORE,
                Permission.AUDIT_READ, Permission.WORKING_HOURS_MANAGE,
                Permission.RESOURCE_MANAGE,
                Permission.STATION_READ, Permission.STATION_MAINTENANCE,
                Permission.APPLICATION_PROFILE_MANAGE,
                Permission.GAMING_SESSION_READ, Permission.GAMING_SESSION_START,
                Permission.GAMING_SESSION_EXTEND, Permission.GAMING_SESSION_TERMINATE,
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_SUMMARY, Permission.DASHBOARD_OPERATIONAL,
                Permission.METRICS_READ, Permission.REPORT_READ, Permission.REPORT_MANAGE,
                Permission.WORKFLOW_ACT, Permission.WORKFLOW_MANAGE,
                Permission.FEATURE_FLAG_MANAGE));
        permissions.put(Role.OWNER, immutableWithProfile(
                Permission.USER_LIST, Permission.USER_CREATE, Permission.USER_DEACTIVATE,
                Permission.USER_DELETE, Permission.USER_RESTORE, Permission.CUSTOMER_READ,
                Permission.CUSTOMER_CREATE, Permission.CUSTOMER_UPDATE_LIMITED,
                Permission.CUSTOMER_DEACTIVATE,
                Permission.CUSTOMER_CRM_MANAGE,
                Permission.CATALOG_MANAGE, Permission.CATALOG_DELETE, Permission.CATALOG_RESTORE,
                Permission.AUDIT_READ, Permission.WORKING_HOURS_MANAGE,
                Permission.RESOURCE_MANAGE,
                Permission.STATION_READ, Permission.STATION_MAINTENANCE,
                Permission.APPLICATION_PROFILE_MANAGE,
                Permission.GAMING_SESSION_READ, Permission.GAMING_SESSION_START,
                Permission.GAMING_SESSION_EXTEND, Permission.GAMING_SESSION_TERMINATE,
                Permission.RESERVATION_READ_ALL, Permission.RESERVATION_CHANGE_STATUS,
                Permission.ORDER_READ_ALL, Permission.ORDER_CHANGE_STATUS,
                Permission.DASHBOARD_SUMMARY, Permission.DASHBOARD_OPERATIONAL,
                Permission.METRICS_READ, Permission.REPORT_READ, Permission.REPORT_MANAGE,
                Permission.WORKFLOW_ACT, Permission.WORKFLOW_MANAGE,
                Permission.FEATURE_FLAG_MANAGE));
        return Map.copyOf(permissions);
    }

    private static Set<Permission> immutableWithProfile(Permission... additional) {
        EnumSet<Permission> result = EnumSet.copyOf(PROFILE);
        result.addAll(Set.of(additional));
        return Set.copyOf(result);
    }
}
