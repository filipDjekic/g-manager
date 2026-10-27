
import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '../../api/catalogApi'

import { hasCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../auth/authStore'
import { CatalogImage } from '../../catalog/CatalogImage'
import type { CatalogItem } from '../../types/catalog.types'


export function CalendarClock({ className = '' }: { className?: string }) {
  return <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M7 2v4M15 2v4M3 9h17M10 21H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4" />
    <circle cx="17" cy="17" r="5" /><path d="M17 14v3l2 1" />
  </svg>
}
export function CustomerReservationIcon({ kind }: { kind: 'check' | 'clock' | 'pin' | 'monitor' | 'refresh' }) {
  const paths = { check: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4L12 14l-3-3', clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    monitor: 'M3 4h18v12H3z M8 21h8 M12 16v5', refresh: 'M20 8a8 8 0 1 0 .6 7 M20 3v5h-5' }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}
export function ReservationServiceMedia({ serviceId, item, eager = false }: { serviceId?: string; item?: CatalogItem; eager?: boolean }) {
  const user = useAuthStore(state => state.user)
  const service = useQuery({ queryKey: ['catalog', 'customer-reservation-service', serviceId], queryFn: () => catalogApi.get(serviceId!),
    enabled: Boolean(serviceId && !item && hasCapability(user, 'CATALOG_READ')), staleTime: 60000, retry: false })
  const value = item ?? service.data
  return <div className="gm-my-reservation-image"><CatalogImage key={value?.imageUrl ?? 'placeholder'} item={{ type: 'SERVICE', imageUrl: value?.imageUrl ?? null }} eager={eager} /></div>
}
