import { hasCapability } from '../auth/capabilities'
import type { AuthUser, Permission, Role } from '../types/auth.types'
import type { FeatureFlagKey } from '../types/feature.types'

export interface NavigationItem { label: string; to: string; capability: Permission; flag?: FeatureFlagKey }
export interface NavigationGroup { label: string; items: NavigationItem[] }
type FeatureState = Record<FeatureFlagKey, boolean>

const management: NavigationGroup[] = [
  { label: 'Pregled', items: [{ label: 'Dashboard', to: '/dashboard', capability: 'DASHBOARD_OPERATIONAL' }] },
  { label: 'Poslovanje', items: [
    { label: 'Rezervacije', to: '/reservations', capability: 'RESERVATION_READ_ALL' },
    { label: 'Kalendar', to: '/calendar', capability: 'RESERVATION_READ_ALL' },
    { label: 'Narudžbine', to: '/orders', capability: 'ORDER_READ_ALL' },
    { label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' },
  ] },
  { label: 'Ljudi', items: [
    { label: 'Klijenti', to: '/customers', capability: 'CUSTOMER_READ' },
    { label: 'Zaposleni', to: '/employees', capability: 'USER_LIST' },
  ] },
  { label: 'Upravljanje', items: [
    { label: 'Izveštaji', to: '/reports', capability: 'REPORT_READ', flag: 'REPORTS' },
    { label: 'Workflow', to: '/workflows', capability: 'WORKFLOW_ACT', flag: 'WORKFLOWS' },
    { label: 'Dokumenti', to: '/documents', capability: 'PROFILE_READ' },
  ] },
  { label: 'Sistem', items: [
    { label: 'Radno vreme', to: '/settings', capability: 'WORKING_HOURS_MANAGE' },
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
  { label: 'Danas', items: [{ label: 'Moj radni dan', to: '/dashboard', capability: 'DASHBOARD_OPERATIONAL' }] },
  { label: 'Operativa', items: [
    { label: 'Moji termini', to: '/reservations', capability: 'RESERVATION_READ_ALL' },
    { label: 'Kalendar', to: '/calendar', capability: 'RESERVATION_READ_ALL' },
    { label: 'Narudžbine', to: '/orders', capability: 'ORDER_READ_ALL' },
  ] },
  { label: 'Alati', items: [
    { label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' },
    { label: 'Izveštaji', to: '/reports', capability: 'REPORT_READ', flag: 'REPORTS' },
    { label: 'Workflow', to: '/workflows', capability: 'WORKFLOW_SUBMIT', flag: 'WORKFLOWS' },
  ] },
  { label: 'Moj nalog', items: [
    { label: 'Profil', to: '/profile', capability: 'PROFILE_READ' },
    { label: 'Sesije', to: '/sessions', capability: 'PROFILE_READ' },
    { label: 'Obaveštenja', to: '/notification-preferences', capability: 'PROFILE_READ' },
  ] },
]

const customer: NavigationGroup[] = [
  { label: 'Istraži', items: [{ label: 'Katalog', to: '/catalog', capability: 'CATALOG_READ' }] },
  { label: 'Moje aktivnosti', items: [
    { label: 'Termini i zakazivanje', to: '/my-reservations', capability: 'RESERVATION_READ_OWN' },
    { label: 'Moje narudžbine', to: '/my-orders', capability: 'ORDER_READ_OWN' },
  ] },
  { label: 'Moj nalog', items: [
    { label: 'Profil', to: '/profile', capability: 'PROFILE_READ' },
    { label: 'Obaveštenja', to: '/notification-preferences', capability: 'PROFILE_READ' },
    { label: 'Sesije', to: '/sessions', capability: 'PROFILE_READ' },
  ] },
]

export function navigationFor(user: AuthUser, flags: FeatureState): NavigationGroup[] {
  const source = user.role === 'CUSTOMER' ? customer : user.role === 'EMPLOYEE' ? employee : management
  return source.map((group) => ({ ...group, items: group.items.filter((item) =>
    hasCapability(user, item.capability) && (!item.flag || flags[item.flag])) })).filter((group) => group.items.length > 0)
}

export function homeForRole(role: Role): string {
  return role === 'CUSTOMER' ? '/catalog' : '/dashboard'
}
