

import { isAxiosError } from 'axios'

import { apiClient, apiErrorMessage } from '../api/client'
import { catalogApi } from '../api/catalogApi'



import { dateInBusinessZone, formatBusinessDateTime } from '../reservations/dateTime'
import type { CatalogItem } from '../types/catalog.types'
import type { UserResponse } from '../types/user.types'
import type { ApiError, PageResponse } from '../types/api.types'
import type { WaitlistOperationalEntry, WaitlistStatus } from '../types/waitlist.types'
export const waitlistLabels: Record<WaitlistStatus, string> = {
  WAITING: 'Čeka termin', OFFERED: 'Ponuda poslata', ACCEPTED: 'Prihvaćeno', CANCELLED: 'Otkazano',
}
export const waitlistDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const resourceLabels: Record<string, string> = { GAMING_PC: 'Gaming računar', PLAYSTATION: 'PlayStation', SIMULATOR: 'Simulator', VIP_ROOM: 'VIP soba', OTHER: 'Drugi resurs' }
export function waitlistCalendar(entry: WaitlistOperationalEntry) {
  return '/calendar?' + new URLSearchParams({ employeeId: entry.employeeId, date: dateInBusinessZone(entry.desiredStart), view: 'day',
    ...(entry.resourceId ? { resourceId: entry.resourceId } : {}), ...(entry.locationId ? { locationId: entry.locationId } : {}) })
}
export function waitlistError(cause: unknown, fallback = 'Prijavu nije moguće sačuvati.') {
  if (cause instanceof Error && !isAxiosError(cause)) return cause.message
  const payload = isAxiosError<ApiError>(cause) ? cause.response?.data : undefined
  const message = payload?.message ?? apiErrorMessage(cause, fallback)
  const requestId = payload?.requestId ? ` (ID zahteva: ${payload.requestId})` : ''
  const translations: Record<string, string> = {
    'Slot is available and can be reserved directly': 'Izabrani termin je slobodan. Možete napraviti direktnu rezervaciju.',
    'An active waitlist entry already exists': 'Klijent već ima aktivnu prijavu za ovaj termin.',
    'Waitlist entry not found': 'Prijava nije pronađena ili više nije u vašem opsegu.',
    'Customer is not available for booking': 'Izaberite aktivan nalog klijenta.',
    'Selected user is not an active employee': 'Izabrani zaposleni nije aktivan.',
    'Waitlist time must be in the future': 'Željeni termin mora biti u budućnosti.',
    'Waitlist management is outside your assigned scope': 'Prijava je van vašeg dodeljenog opsega.',
    'Station management is not permitted': 'Nemate pristup izabranom resursu.',
    'Resource does not support the selected service': 'Resurs ne podržava izabranu uslugu.',
    'Resource does not belong to the selected location': 'Resurs ne pripada izabranom lokalu.',
    'Resource does not belong to the selected area': 'Resurs ne pripada izabranoj zoni.',
    'Area does not belong to the selected location': 'Zona ne pripada izabranom lokalu.',
    'Reservation is outside working hours': 'Ceo termin mora biti unutar radnog vremena.',
    'Employee is on approved time off': 'Zaposleni je odsutan u izabranom terminu.',
    'No compatible bookable resource': 'Nema odgovarajućeg resursa za izabranu uslugu.',
    'Resource or location is inactive or not bookable': 'Resurs ili lokal nije aktivan ili dostupan za rezervisanje.',
    'Area is inactive': 'Izabrana zona nije aktivna.', 'Location is inactive': 'Izabrani lokal nije aktivan.',
    'Catalog item is not a service': 'Izaberite uslugu.', 'Catalog item not found': 'Usluga nije dostupna.',
  }
  if (translations[message]) return translations[message] + requestId
  if (isAxiosError(cause) && cause.response?.status === 409)
    return 'Podaci su promenjeni ili akcija više nije dozvoljena. Osvežite prijavu i pokušajte ponovo.' + requestId
  return apiErrorMessage(cause, fallback)
}
export async function servicesForWaitlist(active?: boolean) {
  const items = new Map<string, CatalogItem>()
  let page = 0, pages: number
  do {
    const result = await catalogApi.list({ page, size: 100, type: 'SERVICE', active, sort: 'name', direction: 'ASC' })
    result.content.forEach(item => items.set(item.id, item)); pages = result.totalPages; page++
  } while (page < pages)
  return [...items.values()]
}
export const waitlistServices = () => servicesForWaitlist(true)
export const waitlistFilterServices = () => servicesForWaitlist()
export async function waitlistEmployees() {
  const items = new Map<string, UserResponse>()
  let page = 0, pages: number
  do {
    const { data } = await apiClient.get<PageResponse<UserResponse>>('/users/employees', { params: { page, size: 100 } })
    data.content.forEach(item => items.set(item.id, item)); pages = data.totalPages; page++
  } while (page < pages)
  return [...items.values()]
}
