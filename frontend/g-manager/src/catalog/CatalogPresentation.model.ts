import type { ItemType } from '../types/catalog.types'
import { formatBusinessDateTime } from '../reservations/dateTime'
export const catalogMoney = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })
export const catalogDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const catalogTypeLabel = (type: ItemType) => type === 'SERVICE' ? 'Usluga' : 'Proizvod'
export const catalogDuration = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`
