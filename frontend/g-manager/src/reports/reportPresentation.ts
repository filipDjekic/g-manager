import { businessInstantToLocal, businessLocalToInstant, todayInBusinessZone } from '../reservations/dateTime'
import type { ReportTemplate } from '../types/report.types'

export const reportLabels: Record<string, string> = { orders: 'Narudžbine', reservations: 'Rezervacije', revenue: 'Iznosi po statusu narudžbina', workload: 'Opterećenje zaposlenih' }
export const reportDefinitions: Record<string, string> = {
  orders: 'Narudžbine kreirane u izabranom periodu, sa statusom i ukupnim iznosom.',
  reservations: 'Rezervacije koje počinju u izabranom periodu, sa zaposlenim i trajanjem.',
  revenue: 'Broj narudžbina i bruto iznos grupisani po statusu. Iznosi nezavršenih narudžbina nisu realizovan prihod; gaming minuti se ne naplaćuju ovim izveštajem.',
  workload: 'Opterećenje zaposlenih na osnovu rezervacija u izabranom periodu.',
}
export function reportDay(value: string, delta: number) {
  const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}
export function reportPreset(preset: string) {
  const today = todayInBusinessZone(), to = reportDay(today, 1)
  return { from: preset === 'today' ? today : preset === 'week' ? reportDay(today, -6) : preset === 'month' ? today.slice(0, 8) + '01' : reportDay(today, -29), to }
}
export function reportPeriod(from: string, to: string) {
  const start = businessLocalToInstant(from + 'T00:00'), end = businessLocalToInstant(to + 'T00:00')
  if (Date.parse(end) <= Date.parse(start) || Math.floor((Date.parse(end) - Date.parse(start)) / 86400000) > 366) throw new Error('Period mora biti pozitivan i najviše 366 dana.')
  return { from: start, to: end }
}
export function templatePeriod(template: ReportTemplate) {
  const [from, to] = template.filters.split('|')
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) throw new Error('Period ovog šablona nije dostupan.')
  return { from: businessInstantToLocal(from).slice(0, 10), to: businessInstantToLocal(to).slice(0, 10), exact: { from, to } }
}
