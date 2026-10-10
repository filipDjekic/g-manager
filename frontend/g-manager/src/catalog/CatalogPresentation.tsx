import type { ItemType } from '../types/catalog.types'
import { formatBusinessDateTime } from '../reservations/dateTime'

export const catalogMoney = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })
export const catalogDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const catalogTypeLabel = (type: ItemType) => type === 'SERVICE' ? 'Usluga' : 'Proizvod'
export const catalogDuration = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`

export function CatalogIcon({ type, search = false }: { type?: ItemType; search?: boolean }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {search ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : type === 'SERVICE' ?
      <><path d="M8 7h8c3 0 4 2 5 7s-1 7-4 4l-2-2H9l-2 2c-3 3-5 1-4-4s2-7 5-7Z" /><path d="M7 10v4m-2-2h4m7-1h.01m2 2h.01" /></> :
      <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9 M7 5.8l9 5" /></>}
  </svg>
}
