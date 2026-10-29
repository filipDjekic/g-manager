import { useLocation } from 'react-router-dom'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { ViewNavigation } from '../components/ui'
import { useFeatureStore } from '../feature/featureStore'
import { managementItems, permittedItems } from './navigation'

/** Keep old deep links while sharing the useful context between related views. */
export function WorkspaceNavigation() {
  const { pathname, search } = useLocation(), user = useAuthStore(state => state.user), flags = useFeatureStore(state => state.flags)
  if (!user) return null
  let label = '', items: { label: string; to: string; active?: boolean }[] = []
  if (['/calendar', '/reservations', '/waitlist'].includes(pathname) && hasCapability(user, 'RESERVATION_READ_ALL')) {
    label = 'Prikazi rezervacija'
    const context = new URLSearchParams(search)
    const target = (path: string) => {
      const query = new URLSearchParams()
      for (const key of ['locationId', 'areaId', 'resourceId', 'customerId']) { const value = context.get(key); if (value) query.set(key, value) }
      if (path !== '/waitlist' && context.get('scope')) query.set('scope', context.get('scope')!)
      if (path !== '/waitlist' && pathname !== '/waitlist' && context.get('status')) query.set('status', context.get('status')!)
      const date = context.get('date') || context.get('from')
      if (date) { if (path === '/reservations') { query.set('from', date); query.set('to', context.get('to') || date) } else query.set('date', date) }
      return `${path}${query.size ? `?${query}` : ''}`
    }
    items = [['Raspored', '/calendar'], ['Lista', '/reservations'], ['Čekanje', '/waitlist']].map(([name, path]) => ({ label: name, to: target(path), active: path === pathname }))
  } else if (['/employees', '/users'].includes(pathname) && hasCapability(user, 'USER_LIST')) {
    label = 'Tim i pristup'; items = [{ label: 'Zaposleni', to: '/employees', active: pathname === '/employees' }, { label: 'Nalozi i obrisani', to: '/users', active: pathname === '/users' }, ...(hasCapability(user,'WORKING_HOURS_MANAGE')?[{ label: 'Odsustva', to: '/settings#time-off' }]:[])]
  } else if (['/profile', '/sessions', '/notification-preferences'].includes(pathname)) {
    label = 'Moj nalog'; items = [{ label: 'Lični podaci', to: '/profile' }, { label: 'Bezbednost i uređaji', to: '/sessions' }, { label: 'Podešavanja obaveštenja', to: '/notification-preferences' }].map(value => ({ ...value, active: value.to.split('?')[0] === pathname }))
  } else if (['/resources', '/stations'].includes(pathname) && user.role !== 'CUSTOMER') {
    label = 'Oprema'; items = [...(hasCapability(user,'RESOURCE_READ')?[{ label: 'Prostor i dostupnost', to: '/resources', active: pathname === '/resources' }]:[]), ...(hasCapability(user, 'STATION_READ') ? [{ label: 'PC konfiguracija', to: '/stations', active: pathname === '/stations' }] : [])]
  } else if (user.role === 'CUSTOMER' && ['/catalog', '/my-orders', '/resources'].includes(pathname)) {
    label = 'Ponuda'; items = [...(hasCapability(user,'CATALOG_READ')?[{ label: 'Usluge i proizvodi', to: '/catalog' }]:[]), ...(hasCapability(user, 'ORDER_READ_OWN') ? [{ label: 'Moje narudžbine', to: '/my-orders?section=history' }] : []), ...(hasCapability(user,'RESOURCE_READ')?[{ label: 'Izaberi mesto', to: '/resources' }]:[])].map(value => ({ ...value, active: value.to.split('?')[0] === pathname }))
  } else if (['/settings', '/reports', '/audit', '/catalog'].includes(pathname) && user.role !== 'CUSTOMER') {
    label = 'Upravljanje'; items = permittedItems(user, flags, managementItems).map(value => ({ label: value.label, to: value.to, active: value.to.split('?')[0] === pathname }))
  }
  return items.length ? <ViewNavigation label={label} items={items} /> : null
}
