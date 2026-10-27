import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '../../api/catalogApi'
import { resourceApi } from '../../api/resourceApi'
import { hasCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../auth/authStore'

import type { CatalogItem } from '../../types/catalog.types'
import { reservationApiErrorMessage } from '../bookingConflictReason'
export function customerReservationError(cause: unknown, fallback: string) {
  return reservationApiErrorMessage(cause, fallback)
    .replace('Reservation not found', 'Rezervacija nije pronađena.')
    .replace('It is too late to cancel this reservation', 'Rok za otkazivanje ovog termina je istekao.')
    .replace('Invalid reservation status transition', 'Status rezervacije se promenio. Osvežite pregled.')
    .replace('A reason is required to reject or cancel a reservation', 'Unesite razlog otkazivanja rezervacije.')
    .replace('Reservation was modified by another request', 'Rezervacija je u međuvremenu promenjena. Osvežite podatke.')
    .replace('Customer access is required', 'Ovaj pregled je dostupan prijavljenom klijentu.')
    .replace('Reservation duration is outside the permitted range', 'Trajanje rezervacije je izvan dozvoljenog raspona.')
    .replace('This service has a fixed reservation duration', 'Ova usluga ima fiksno trajanje rezervacije.')
}
export async function loadBookingServices() {
  const items = new Map<string, CatalogItem>()
  let page = 0, totalPages: number
  do {
    const result = await catalogApi.list({ page, size: 100, type: 'SERVICE', active: true, sort: 'name', direction: 'ASC' })
    result.content.forEach(item => items.set(item.id, item)); totalPages = result.totalPages; page++
  } while (page < totalPages)
  return [...items.values()]
}
export function useReservationArea(serviceId?: string, resourceId?: string | null) {
  const user = useAuthStore(state => state.user)
  const resources = useQuery({ queryKey: ['resources', 'customer-reservation-service', serviceId], queryFn: () => resourceApi.catalogResources(serviceId!),
    enabled: Boolean(serviceId && resourceId && hasCapability(user, 'RESOURCE_READ')), staleTime: 60000, retry: false })
  return resources.data?.find(value => value.id === resourceId)?.areaName
}
export const customerDate = (value: string) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'Europe/Belgrade', dateStyle: 'long' }).format(new Date(value))
export function customerDuration(minutes: number) {
  return [minutes >= 60 ? `${Math.floor(minutes / 60)} h` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ') || '0 min'
}
