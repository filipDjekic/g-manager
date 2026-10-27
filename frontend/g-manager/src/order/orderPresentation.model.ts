import { isAxiosError } from 'axios'
import { apiErrorMessage } from '../api/client'
import { isConflictResponse } from '../api/idempotency'
import { hasCapability } from '../auth/capabilities'
import type { AuthUser } from '../types/auth.types'
import type { ManagedOrder, Order, OrderStatus } from '../types/order.types'
import { todayInBusinessZone } from '../reservations/dateTime'
export const orderMoney = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })
export const shortOrderId = (id: string) => `#${id.slice(0, 8)}`
export const initials = (name: string | null) => name?.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('sr-Latn-RS') || '?'
export const orderQuantity = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0)
export function itemCountLabel(count: number) {
  const ending = count % 10, hundred = count % 100
  return `${count} ${ending === 1 && hundred !== 11 ? 'stavka' : ending >= 2 && ending <= 4 && (hundred < 12 || hundred > 14) ? 'stavke' : 'stavki'}`
}
export const handlerLabel = (order: ManagedOrder, user: AuthUser | null) => !order.handledBy ? 'Nepreuzeta'
  : user && order.handledBy === user.id ? `${user.name} (vi)` : order.handledByName ?? 'Osoba nije dostupna'
export const customerLabel = (order: ManagedOrder, user: AuthUser | null) => hasCapability(user, 'CUSTOMER_READ')
  ? order.customerName ?? 'Klijent nije dostupan' : 'Podaci o klijentu nisu dostupni'

export function canChangeOrder(order: Order, status: OrderStatus, user: AuthUser | null) {
  if (!user || !hasCapability(user, 'ORDER_READ_ALL') || !hasCapability(user, 'ORDER_CHANGE_STATUS')) return false
  const management = user.role === 'OWNER' || user.role === 'ADMIN'
  const employee = user.role === 'EMPLOYEE'
  const handler = employee && order.handledBy === user.id
  if (status === 'IN_PROGRESS') return order.status === 'CREATED' && (employee || management)
  if (status === 'READY') return order.status === 'IN_PROGRESS' && (handler || management)
  if (status === 'COMPLETED') return order.status === 'READY' && (handler || management)
  if (status === 'CANCELLED') return order.status === 'CREATED' && (employee || management)
    || order.status === 'IN_PROGRESS' && (handler || management) || order.status === 'READY' && management
  return false
}

export const orderActionLabels: Partial<Record<OrderStatus, string>> = {
  IN_PROGRESS: 'Preuzmi narudžbinu', READY: 'Označi kao spremnu', COMPLETED: 'Označi kao preuzetu', CANCELLED: 'Otkaži narudžbinu',
}
export function orderErrorMessage(cause: unknown, fallback: string) {
  const message = (cause instanceof Error && !isAxiosError(cause) ? cause.message || fallback : apiErrorMessage(cause, fallback))
    .replace('Order was changed; refresh and try again', 'Narudžbina je u međuvremenu promenjena.')
    .replace('Invalid order status transition', 'Ova promena statusa više nije dostupna.')
    .replace('This order action is not permitted', 'Nemate dozvolu za ovu akciju nad narudžbinom.')
    .replace('Order not found', 'Narudžbina nije pronađena.')
    .replace('Catalog item not found', 'Proizvod nije dostupan u katalogu.')
    .replace('Only products can be added to an order', 'Narudžbina može sadržati samo proizvode.')
    .replace('Each product may appear only once per order', 'Proizvod može biti naveden samo jednom u narudžbini.')
    .replace('Only customers can create orders', 'Naručivanje je dostupno samo kupcima.')
    .replace('Customer access is required', 'Pregled je dostupan samo kupcima.')
    .replace('Order management is not permitted', 'Nemate dozvolu za pregled narudžbina.')
    .replace('Access is denied', 'Nemate dozvolu za ovu akciju.')
    .replace('Authentication is required', 'Potrebno je da se ponovo prijavite.')
  return isConflictResponse(cause) ? `${message} Zatvorite potvrdu i ponovo izaberite akciju nad osveženim podacima.` : message
}

export const periodOptions = [
  ['ALL', 'Sve vreme'], ['TODAY', 'Danas'], ['WEEK', 'Poslednjih 7 dana'], ['MONTH', 'Poslednjih 30 dana'],
  ['THIS_MONTH', 'Ovaj mesec'], ['CUSTOM', 'Prilagođeni period'],
] as const
export function offsetDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function periodDates(value: string, today = todayInBusinessZone()) {
  if (value === 'ALL') return { from: '', to: '' }
  return { from: value === 'WEEK' ? offsetDate(today, -6) : value === 'MONTH' ? offsetDate(today, -29)
    : value === 'THIS_MONTH' ? `${today.slice(0, 7)}-01` : today, to: today }
}
export function currentPeriod(from: string, to: string) {
  return periodOptions.find(([value]) => value !== 'CUSTOM' && periodDates(value).from === from && periodDates(value).to === to)?.[0] ?? 'CUSTOM'
}
export function validOrderDate(value: string) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function periodLabel(from?: string | null, to?: string | null) {
  const date = (value: string) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`))
  return from && to ? `${date(from)} – ${date(to)}` : from ? `Od ${date(from)}` : to ? `Do ${date(to)}` : 'Sve vreme'
}
