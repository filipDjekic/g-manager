import type { NotificationPreference, NotificationType } from '../types/notification.types'

export type NotificationChannel = 'inAppEnabled' | 'emailEnabled'
export type NotificationIconKind = 'bell' | 'mail' | 'monitor' | 'shield' | 'lock' | 'calendarPlus' | 'calendarClock'
  | 'bag' | 'package' | 'ticket' | 'calendarX' | 'file' | 'info' | 'save' | 'arrow'

export const notificationDefinitions: Record<NotificationType, { label: string; description: string; icon: NotificationIconKind }> = {
  SECURITY_SESSION_STARTED: { label: 'Nova prijava na nalog', description: 'Obaveštenje o novoj prijavi na vaš nalog.', icon: 'shield' },
  SECURITY_PASSWORD_CHANGED: { label: 'Promena lozinke', description: 'Obaveštenje kada je lozinka naloga promenjena.', icon: 'lock' },
  RESERVATION_CREATED: { label: 'Nova rezervacija', description: 'Obaveštenje o kreiranju nove rezervacije.', icon: 'calendarPlus' },
  RESERVATION_STATUS_CHANGED: { label: 'Promena statusa rezervacije', description: 'Obaveštenje kada se promeni status rezervacije.', icon: 'calendarClock' },
  ORDER_CREATED: { label: 'Nova narudžbina', description: 'Obaveštenje o novoj narudžbini.', icon: 'bag' },
  ORDER_STATUS_CHANGED: { label: 'Promena statusa narudžbine', description: 'Obaveštenje kada se promeni status narudžbine.', icon: 'package' },
  WAITLIST_OFFERED: { label: 'Ponuda slobodnog termina', description: 'Obaveštenje kada vam se ponudi slobodan termin.', icon: 'ticket' },
  WAITLIST_CANCELLED: { label: 'Otkazivanje prijave', description: 'Obaveštenje o otkazivanju prijave na listu čekanja.', icon: 'calendarX' },
  REPORT_COMPLETED: { label: 'Završen izveštaj', description: 'Obaveštenje kada je generisanje izveštaja završeno.', icon: 'file' },
}

export const notificationGroups: { label: string; icon: NotificationIconKind; types: NotificationType[] }[] = [
  { label: 'Bezbednost', icon: 'shield', types: ['SECURITY_SESSION_STARTED', 'SECURITY_PASSWORD_CHANGED'] },
  { label: 'Rezervacije', icon: 'calendarClock', types: ['RESERVATION_CREATED', 'RESERVATION_STATUS_CHANGED'] },
  { label: 'Narudžbine', icon: 'bag', types: ['ORDER_CREATED', 'ORDER_STATUS_CHANGED'] },
  { label: 'Lista čekanja', icon: 'ticket', types: ['WAITLIST_OFFERED', 'WAITLIST_CANCELLED'] },
  { label: 'Izveštaji', icon: 'file', types: ['REPORT_COMPLETED'] },
]

export function normalizePreference(value: NotificationPreference): NotificationPreference {
  return value.mandatory ? { ...value, inAppEnabled: true, emailEnabled: true } : { ...value }
}

export function activePreferences(values: NotificationPreference[]) {
  return values.filter(value => Object.hasOwn(notificationDefinitions, value.type)).map(normalizePreference)
}

export function changedPreferences(saved: NotificationPreference[], draft: NotificationPreference[]) {
  const baseline = new Map(saved.map(value => [value.type, value]))
  return draft.filter(value => {
    const previous = baseline.get(value.type)
    return !value.mandatory && previous && (value.inAppEnabled !== previous.inAppEnabled || value.emailEnabled !== previous.emailEnabled)
  })
}

export function mergePreferences(current: NotificationPreference[], confirmed: NotificationPreference[]) {
  const results = new Map(confirmed.map(value => [value.type, value]))
  return current.map(value => results.get(value.type) ?? value)
}

export function channelState(items: NotificationPreference[], channel: NotificationChannel): boolean | 'mixed' {
  const editable = items.filter(value => !value.mandatory)
  if (!editable.length || editable.every(value => !value[channel])) return false
  return editable.every(value => value[channel]) ? true : 'mixed'
}
