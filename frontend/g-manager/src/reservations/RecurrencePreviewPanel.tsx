import { Badge } from '../components/ui'
import { formatBusinessDateTime, formatBusinessIntervalEnd } from './dateTime'
import type { RecurrenceConflictPolicy, RecurrenceCreateResult, RecurrencePreview } from '../types/reservation.types'

import { bookingConflictReason } from './bookingConflictReason'

export function RecurrencePreviewPanel({ preview, policy, locale = 'sr-RS' }: { preview: RecurrencePreview; policy: RecurrenceConflictPolicy; locale?: string }) {
  const available = preview.occurrences.filter(item => item.available).length
  const conflicts = preview.occurrences.length - available
  const toCreate = policy === 'ALL_OR_NOTHING' && conflicts ? 0 : available
  return <section className="recurrence-preview" aria-label="Pregled ponavljanja">
    <div className="recurrence-totals"><Badge tone="success">Dostupno: {available}</Badge><Badge tone={conflicts ? 'warning' : 'neutral'}>Konflikti: {conflicts}</Badge><Badge tone="info">Biće kreirano: {toCreate}</Badge></div>
    {policy === 'ALL_OR_NOTHING' && conflicts > 0 && <p className="warning-banner">Serija neće biti kreirana dok svi termini ne budu dostupni.</p>}
    {available === 0 && <p className="warning-banner">Nijedan termin nije dostupan. Prazna serija neće biti kreirana.</p>}
    <ol className="recurrence-occurrences">{preview.occurrences.map(item => <li key={item.startTime}>
      <div><strong>{formatBusinessDateTime(item.startTime, false, locale)} – {formatBusinessIntervalEnd(item.startTime,item.endTime,locale)}</strong>
        <p>{[item.resourceCode, item.resourceName, item.locationName].filter(Boolean).join(' · ') || 'Bez određenog resursa'}</p></div>
      <div><Badge tone={item.available ? 'success' : 'warning'}>{item.available ? 'Dostupno' : 'Konflikt'}</Badge>
        {!item.available && <p>Konflikt: {bookingConflictReason(item.reason)}</p>}</div>
    </li>)}</ol><p className="search-help">Pri kreiranju se ponovo proveravaju dostupnost i prava. Pregled ne rezerviše termine.</p>
  </section>
}

export function RecurrenceResultPanel({ result, locale = 'sr-RS' }: { result: RecurrenceCreateResult; locale?: string }) {
  return <section className="panel recurrence-result" aria-label="Rezultat kreiranja serije">
    <h2>Rezultat serije</h2><p role="status">Kreirano rezervacija: {result.created.length}; preskočeno: {result.skipped.length}.</p>
    <ol className="recurrence-occurrences">{result.created.map(item => <li key={item.id}><div>
      <strong>{formatBusinessDateTime(item.startTime, false, locale)} – {formatBusinessIntervalEnd(item.startTime,item.endTime,locale)}</strong>
      <p>{[item.resourceCode, item.resourceName, item.locationName].filter(Boolean).join(' · ')}</p></div><Badge tone="success">Kreirano</Badge></li>)}</ol>
    {result.skipped.length > 0 && <><h3>Preskočeni termini</h3><ol className="recurrence-occurrences">{result.skipped.map(item => <li key={item.startTime}><div>
      <strong>{formatBusinessDateTime(item.startTime, false, locale)} – {formatBusinessIntervalEnd(item.startTime,item.endTime,locale)}</strong>
      <p>{[item.resourceCode, item.resourceName, item.locationName].filter(Boolean).join(' · ')}</p>
      <p>{bookingConflictReason(item.reason)}</p></div><Badge tone="warning">Preskočeno</Badge></li>)}</ol></>}
  </section>
}
