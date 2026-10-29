import { hasCapability } from '../auth/capabilities'
import type { AuthUser, Permission, Role } from '../types/auth.types'
import type { FeatureFlagKey } from '../types/feature.types'

export interface NavigationItem { label: string; to: string; capability: Permission | Permission[]; flag?: FeatureFlagKey; description?: string }
export interface NavigationGroup { label: string; items: NavigationItem[] }
type FeatureState = Record<FeatureFlagKey, boolean>
const item = (label: string, to: string, capability: Permission | Permission[], description?: string, flag?: FeatureFlagKey): NavigationItem => ({ label, to, capability, description, flag })
const management = [
  item('Pregled', '/dashboard', ['DASHBOARD_SUMMARY', 'DASHBOARD_OPERATIONAL']),
  item('Radni ekran', '/gaming-sessions', 'GAMING_SESSION_READ'),
  item('Rezervacije', '/calendar', 'RESERVATION_READ_ALL'),
  item('Narudžbine', '/orders', 'ORDER_READ_ALL'), item('Klijenti', '/customers', 'CUSTOMER_READ'),
  item('Oprema', '/equipment', 'RESOURCE_READ'),
  item('Upravljanje', '/management', ['USER_LIST', 'CATALOG_MANAGE', 'WORKING_HOURS_MANAGE', 'REPORT_READ', 'AUDIT_READ']),
]
const employee = [item('Radni ekran', '/dashboard', ['DASHBOARD_OPERATIONAL', 'GAMING_SESSION_READ']),
  item('Rezervacije', '/calendar', 'RESERVATION_READ_ALL'), item('Narudžbine', '/orders', 'ORDER_READ_ALL'),
  item('Klijenti', '/customers', 'CUSTOMER_READ'), item('Alati', '/tools', ['CATALOG_READ', 'RESOURCE_READ', 'STATION_READ', 'REPORT_READ']),
]
const customer = [item('Početna', '/home', ['RESERVATION_READ_OWN', 'ORDER_READ_OWN']),
  item('Rezerviši', '/my-reservations?booking=new', 'RESERVATION_CREATE'),
  item('Moji termini', '/my-reservations', 'RESERVATION_READ_OWN'), item('Ponuda', '/catalog', 'CATALOG_READ')]

export const managementItems: NavigationItem[] = [
  item('Tim i pristup', '/employees', 'USER_LIST', 'Zaposleni, korisnički nalozi i dodele resursa.'),
  item('Ponuda i cene', '/catalog', 'CATALOG_MANAGE', 'Usluge, proizvodi, slike i dostupnost ponude.'),
  item('Rad igraonice', '/settings', 'WORKING_HOURS_MANAGE', 'Radno vreme, izuzeci i odsustva zaposlenih.'),
  item('Izveštaji', '/reports', 'REPORT_READ', 'Generisanje, preuzimanje i rasporedi izveštaja.', 'REPORTS'),
  item('Evidencija promena', '/audit', 'AUDIT_READ', 'Aktivnosti i istorija promena u sistemu.'),
]
export const equipmentItems: NavigationItem[] = [
  item('Prostor i resursi', '/resources', 'RESOURCE_READ', 'Lokacije, zone, tlocrt i dostupnost za izabrani interval.'),
  item('PC konfiguracija', '/stations', 'STATION_READ', 'Podešavanje računara, profila aplikacija i Gaming Client-a.'),
]
export const toolItems: NavigationItem[] = [
  item('Ponuda', '/catalog', 'CATALOG_READ', 'Dostupne usluge i proizvodi.'),
  item('Mapa dostupnosti', '/resources', 'RESOURCE_READ', 'Dostupnost mesta za izabrani interval.'),
  item('Informacije o stanicama', '/stations', 'STATION_READ', 'Pregled PC konfiguracije i veze sa klijentom.'),
  item('Izveštaji', '/reports', 'REPORT_READ', 'Generisanje i preuzimanje dostupnih izveštaja.', 'REPORTS'),
]
export function permittedItems(user: AuthUser, flags: FeatureState, items: NavigationItem[]) {
  return items.filter(value => (Array.isArray(value.capability) ? value.capability.some(permission => hasCapability(user, permission))
    : hasCapability(user, value.capability)) && (!value.flag || flags[value.flag]))
}
export function navigationFor(user: AuthUser, flags: FeatureState): NavigationGroup[] {
  const primary = user.role === 'CUSTOMER' ? customer : user.role === 'EMPLOYEE' ? employee.map(value => value.to === '/dashboard' && !hasCapability(user,'DASHBOARD_OPERATIONAL') && !hasCapability(user,'DASHBOARD_SUMMARY') ? { ...value, to:'/gaming-sessions' } : value) : management
  const items = permittedItems(user, flags, primary).filter(value => {
    if (value.to === '/management') return permittedItems(user,flags,managementItems).length > 0
    if (value.to === '/equipment') return permittedItems(user,flags,equipmentItems).length > 0
    if (value.to === '/tools') return permittedItems(user,flags,toolItems).length > 0
    if (value.to.includes('booking=new')) return hasCapability(user,'RESERVATION_READ_OWN')
    return true
  })
  return items.length ? [{ label:user.role==='CUSTOMER'?'Moj prostor':'Radni prostor', items }] : []
}
export function navigationActive(to: string, pathname: string, search = '', role?: Role) {
  if (to.includes('?')) return pathname === '/my-reservations' && new URLSearchParams(search).get('booking') === 'new'
  if (to === '/my-reservations') return pathname === to && new URLSearchParams(search).get('booking') !== 'new'
  if (to === '/calendar') return ['/calendar', '/reservations', '/waitlist'].includes(pathname)
  if (to === '/equipment') return ['/equipment', '/resources', '/stations'].includes(pathname)
  if (to === '/management') return ['/management', '/employees', '/users', '/settings', '/reports', '/audit', '/catalog'].includes(pathname)
  if (to === '/tools') return ['/tools', '/resources', '/stations', '/reports', '/catalog'].includes(pathname)
  if (to === '/catalog' && role === 'CUSTOMER') return ['/catalog', '/my-orders', '/resources'].includes(pathname)
  if (to === '/dashboard' && role === 'EMPLOYEE') return ['/dashboard', '/gaming-sessions'].includes(pathname)
  return to === pathname
}
export function homeForRole(role: Role) { return role === 'CUSTOMER' ? '/home' : '/dashboard' }
export function homeForUser(user: AuthUser, flags: FeatureState) {
  const items = navigationFor(user, flags).flatMap(group => group.items), preferred = homeForRole(user.role)
  if (user.role !== 'CUSTOMER' && (hasCapability(user,'DASHBOARD_OPERATIONAL') || hasCapability(user,'DASHBOARD_SUMMARY'))) return '/dashboard'
  const available = items.find(value => value.to === preferred)?.to ?? items[0]?.to
  return available ?? permittedItems(user, flags, [...toolItems,...managementItems,...equipmentItems])[0]?.to ?? (hasCapability(user,'PROFILE_READ')?'/profile':'/unauthorized')
}
