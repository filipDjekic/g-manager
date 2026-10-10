import { hasCapability } from '../auth/capabilities'
import type { AuthUser, Permission, Role } from '../types/auth.types'
import type { FeatureFlagKey } from '../types/feature.types'

export interface NavigationItem { label: string; to: string; capability: Permission | Permission[]; flag?: FeatureFlagKey }
export interface NavigationGroup { label: string; items: NavigationItem[] }
type FeatureState = Record<FeatureFlagKey, boolean>

const management: NavigationGroup[] = [
  { label: 'Glavno', items: [
    { label: 'Dashboard', to: '/dashboard', capability: ['DASHBOARD_SUMMARY', 'DASHBOARD_OPERATIONAL'] },
    { label: 'Kalendar', to: '/calendar', capability: 'RESERVATION_READ_ALL' },
    { label: 'Gaming operativa', to: '/gaming-sessions', capability: 'GAMING_SESSION_READ' },
  ] },
  { label: 'Poslovanje', items: [
    { label: 'Rezervacije', to: '/reservations', capability: 'RESERVATION_READ_ALL' },
    { label: 'Lista čekanja', to: '/waitlist', capability: 'RESERVATION_READ_ALL' },
    { label: 'Narudžbine', to: '/orders', capability: 'ORDER_READ_ALL' },
    { label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' },
    { label: 'Klijenti', to: '/customers', capability: 'CUSTOMER_READ' },
  ] },
  { label: 'Resursi', items: [
    { label: 'Gaming stanice', to: '/stations', capability: 'STATION_READ' },
    { label: 'Mapa resursa', to: '/resources', capability: 'RESOURCE_READ' },
    { label: 'Zaposleni', to: '/employees', capability: 'USER_LIST' },
  ] },
  { label: 'Upravljanje', items: [
    { label: 'Izveštaji', to: '/reports', capability: 'REPORT_READ', flag: 'REPORTS' },
    { label: 'Workflow', to: '/workflows', capability: ['WORKFLOW_SUBMIT', 'WORKFLOW_ACT', 'WORKFLOW_MANAGE'], flag: 'WORKFLOWS' },
    { label: 'Dokumenti', to: '/documents', capability: 'PROFILE_READ' },
    { label: 'Podešavanja', to: '/settings', capability: 'WORKING_HOURS_MANAGE' },
  ] },
  { label: 'Sistem', items: [
    { label: 'Korisnici', to: '/users', capability: 'USER_LIST' },
    { label: 'Audit', to: '/audit', capability: 'AUDIT_READ' },
    { label: 'Feature flags', to: '/features', capability: 'FEATURE_FLAG_MANAGE' },
  ] },
  { label: 'Moj nalog', items: [
    { label: 'Profil', to: '/profile', capability: 'PROFILE_READ' },
    { label: 'Sesije', to: '/sessions', capability: 'PROFILE_READ' },
    { label: 'Obaveštenja', to: '/notification-preferences', capability: 'PROFILE_READ' },
  ] },
]

const employee: NavigationGroup[] = [
  { label: 'Danas', items: [{ label: 'Moj radni dan', to: '/dashboard', capability: ['DASHBOARD_OPERATIONAL', 'DASHBOARD_SUMMARY'] }] },
  { label: 'Operativa', items: [
    { label: 'Termini', to: '/reservations', capability: 'RESERVATION_READ_ALL' },
    { label: 'Kalendar', to: '/calendar', capability: 'RESERVATION_READ_ALL' },
    { label: 'Mapa resursa', to: '/resources', capability: 'RESOURCE_READ' },
    { label: 'Gaming stanice', to: '/stations', capability: 'STATION_READ' },
    { label: 'Gaming operativa', to: '/gaming-sessions', capability: 'GAMING_SESSION_READ' },
    { label: 'Lista čekanja', to: '/waitlist', capability: 'RESERVATION_READ_ALL' },
    { label: 'Narudžbine', to: '/orders', capability: 'ORDER_READ_ALL' },
  ] },
  { label: 'Alati', items: [
    { label: 'Klijenti', to: '/customers', capability: 'CUSTOMER_READ' },
    { label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' },
    { label: 'Izveštaji', to: '/reports', capability: 'REPORT_READ', flag: 'REPORTS' },
    { label: 'Workflow', to: '/workflows', capability: ['WORKFLOW_SUBMIT', 'WORKFLOW_ACT', 'WORKFLOW_MANAGE'], flag: 'WORKFLOWS' },
    { label: 'Dokumenti', to: '/documents', capability: 'PROFILE_READ' },
  ] },
  { label: 'Moj nalog', items: [
    { label: 'Profil', to: '/profile', capability: 'PROFILE_READ' },
    { label: 'Sesije', to: '/sessions', capability: 'PROFILE_READ' },
    { label: 'Obaveštenja', to: '/notification-preferences', capability: 'PROFILE_READ' },
  ] },
]

const customer: NavigationGroup[] = [
  { label: 'Moj prostor', items: [{ label: 'Početna', to: '/home', capability: ['RESERVATION_READ_OWN', 'ORDER_READ_OWN'] }] },
  { label: 'Istraži', items: [{ label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' }, { label: 'Mapa resursa', to: '/resources', capability: 'RESOURCE_READ' }] },
  { label: 'Moje aktivnosti', items: [
    { label: 'Termini i zakazivanje', to: '/my-reservations', capability: 'RESERVATION_READ_OWN' },
    { label: 'Moje narudžbine', to: '/my-orders', capability: 'ORDER_READ_OWN' },
  ] },
  { label: 'Moj nalog', items: [
    { label: 'Profil', to: '/profile', capability: 'PROFILE_READ' },
    { label: 'Obaveštenja', to: '/notification-preferences', capability: 'PROFILE_READ' },
    { label: 'Sesije', to: '/sessions', capability: 'PROFILE_READ' },
    { label: 'Dokumenti', to: '/documents', capability: 'PROFILE_READ' },
  ] },
]

export function navigationFor(user: AuthUser, flags: FeatureState): NavigationGroup[] {
  const source = user.role === 'CUSTOMER' ? customer : user.role === 'EMPLOYEE' ? employee : management
  return source.map((group) => ({ ...group, items: group.items.filter((item) =>
    (Array.isArray(item.capability) ? item.capability.some((permission) => hasCapability(user, permission)) : hasCapability(user, item.capability))
      && (!item.flag || flags[item.flag])) })).filter((group) => group.items.length > 0)
}

export function homeForRole(role: Role): string {
  return role === 'CUSTOMER' ? '/home' : '/dashboard'
}

export function homeForUser(user: AuthUser, flags: FeatureState): string {
  const items = navigationFor(user, flags).flatMap((group) => group.items)
  const preferred = homeForRole(user.role)
  return items.find((item) => item.to === preferred)?.to ?? items[0]?.to ?? '/unauthorized'
}
