
import { businessLocalToInstant, dateInBusinessZone, todayInBusinessZone } from '../reservations/dateTime'
import type { AuditEvent } from '../types/audit.types'
export const auditDefaults = { search: '', action: '', resourceType: '', actorId: '', from: '', to: '',
  period: 'LAST_30', sort: 'createdAt', direction: 'DESC', page: '0', size: '20', eventId: '' }
export const auditUrlKeys = Object.keys(auditDefaults) as (keyof typeof auditDefaults)[]
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type AuditUrlState = typeof auditDefaults
export type AuditDraft = Pick<AuditUrlState, 'action' | 'resourceType' | 'actorId' | 'from' | 'to' | 'period' | 'sort' | 'direction'>
export const periods = { TODAY: 'Danas', LAST_7: 'Poslednjih 7 dana', LAST_30: 'Poslednjih 30 dana',
  MONTH: 'Ovaj mesec', CUSTOM: 'Prilagođeni period', ALL: 'Svi datumi' }
export type AuditPeriod = keyof typeof periods
export const sortOptions = [
  { sort: 'createdAt', direction: 'DESC', label: 'Najnovije prvo' },
  { sort: 'createdAt', direction: 'ASC', label: 'Najstarije prvo' },
  { sort: 'action', direction: 'ASC', label: 'Akcija, A-Z' },
  { sort: 'resourceType', direction: 'ASC', label: 'Tip resursa, A-Z' },
  { sort: 'action', direction: 'DESC', label: 'Akcija, Z-A' },
  { sort: 'resourceType', direction: 'DESC', label: 'Tip resursa, Z-A' },
  { sort: 'actorRole', direction: 'ASC', label: 'Uloga izvršioca, A-Z' },
  { sort: 'actorRole', direction: 'DESC', label: 'Uloga izvršioca, Z-A' },
]

export function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
export function draftFromUrl(state: AuditUrlState): AuditDraft {
  return { action: state.action, resourceType: state.resourceType, actorId: state.actorId,
    from: state.from, to: state.to, period: state.from || state.to ? 'CUSTOM'
      : Object.hasOwn(periods, state.period) ? state.period : 'LAST_30',
    sort: sortOptions.some(item => item.sort === state.sort) ? state.sort : 'createdAt',
    direction: state.direction === 'ASC' ? 'ASC' : 'DESC' }
}
export function defaultDraft(): AuditDraft { return draftFromUrl(auditDefaults) }
export function periodBounds(draft: AuditDraft, today = todayInBusinessZone()) {
  switch (draft.period) {
    case 'TODAY': return { from: today, to: today }
    case 'LAST_7': return { from: shiftDate(today, -6), to: today }
    case 'LAST_30': return { from: shiftDate(today, -29), to: today }
    case 'MONTH': {
      const end = new Date(`${today}T12:00:00Z`)
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      return { from: `${today.slice(0, 7)}-01`, to: end.toISOString().slice(0, 10) }
    }
    case 'CUSTOM': return { from: draft.from, to: draft.to }
    default: return { from: '', to: '' }
  }
}
export function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('sr-Latn-RS',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}
export function periodLabel(draft: AuditDraft) {
  const bounds = periodBounds(draft)
  return bounds.from || bounds.to ? `${bounds.from ? dateLabel(bounds.from) : 'Bez donje granice'} - ${bounds.to ? dateLabel(bounds.to) : 'Bez gornje granice'}` : 'Svi datumi'
}
export function validateDraft(draft: AuditDraft): string {
  if (draft.actorId.trim() && !uuidPattern.test(draft.actorId.trim())) return 'Unesite ispravan UUID izvršioca.'
  if (draft.period !== 'CUSTOM') return ''
  if (!draft.from && !draft.to) return 'Izaberite najmanje jedan datum za prilagođeni period.'
  try {
    for (const value of [draft.from, draft.to].filter(Boolean)) businessLocalToInstant(`${value}T00:00`)
  } catch { return 'Unesite ispravan datum u periodu.' }
  return draft.from && draft.to && draft.from > draft.to ? 'Datum „Do“ ne može biti pre datuma „Od“.' : ''
}
export function dayHeading(instant: string, today = todayInBusinessZone()) {
  const day = dateInBusinessZone(instant)
  return day === today ? 'Danas' : day === shiftDate(today, -1) ? 'Juče' : dateLabel(day)
}
export type AuditActionTone = 'create' | 'update' | 'delete' | 'deactivate' | 'other'
export function actionTone(event: AuditEvent): AuditActionTone {
  const tones: Record<AuditEvent['category'], AuditActionTone> = {
    CREATE: 'create', UPDATE: 'update', DELETE: 'delete', DEACTIVATE: 'deactivate', OTHER: 'other',
  }
  return tones[event.category] ?? 'other'
}
export const categoryLabels = { CREATE: 'Kreiranje', UPDATE: 'Izmena', DELETE: 'Brisanje', DEACTIVATE: 'Deaktivacija', OTHER: 'Događaj' }
export function shortId(value: string) { return value.slice(0, 8) }

export type AuditIconKind = 'shield' | 'search' | 'filters' | 'reset' | 'file' | 'create' | 'update' | 'delete' | 'deactivate' | 'other' | 'copy' | 'clock' | 'chevronLeft' | 'chevronRight' | 'close' | 'user'
