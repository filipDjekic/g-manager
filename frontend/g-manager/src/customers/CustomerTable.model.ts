







import { formatBusinessDateTime } from '../reservations/dateTime'
import type { CustomerListItem } from '../types/customer.types'
export const customerDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const customerMoney = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })

export type CustomerAction = 'PROFILE' | 'EDIT' | 'START' | 'DEACTIVATE'
export type ActionHandler = (customer: CustomerListItem, action: CustomerAction, opener: HTMLButtonElement | null) => void
