import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, ErrorState, Skeleton } from '../components/ui'
import { useServerNow } from '../gaming/useServerNow'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { formatBusinessTime, formatBusinessIntervalEnd } from '../reservations/dateTime'
import type { WaitlistDetail, WaitlistOperationalEntry, WaitlistHistoryEvent } from '../types/waitlist.types'
import { resourceLabels, WaitlistAvatar, WaitlistIcon, WaitlistStatusBadge, waitlistCalendar, waitlistDate, waitlistError } from './waitlistPresentation'

const historyLabels: Record<WaitlistHistoryEvent['type'], string> = {
  ENTRY_CREATED: 'Kreirana prijava', ENTRY_UPDATED: 'Izmenjena prijava', OFFER_CREATED: 'Kreirana ponuda',
  OFFER_EXPIRED: 'Ponuda istekla', OFFER_INVALIDATED: 'Ponuda poništena', OFFER_ACCEPTED: 'Ponuda prihvaćena', ENTRY_CANCELLED: 'Prijava otkazana',
}
export function WaitlistDetailsPanel({ detail, loading, error, fetching, inline, selectedId, onClose, onRefresh, onEdit, onCancel }: {
  detail?: WaitlistDetail; loading: boolean; error: unknown; fetching: boolean; inline: boolean; selectedId: string
  onClose: () => void; onRefresh: () => void; onEdit: (entry: WaitlistOperationalEntry, opener: HTMLButtonElement | null) => void
  onCancel: (entry: WaitlistOperationalEntry) => void
}) {
  const canManage = hasCapability(useAuthStore(state => state.user), 'WAITLIST_MANAGE')
  const [tab, setTab] = useState<'information' | 'history'>('information'), id = useId(), panel = useRef<HTMLElement>(null)
  const entry = detail?.entry, now = useServerNow(entry?.serverTime)
  useEffect(() => {
    setTab('information')
    if (inline) panel.current?.focus({ preventScroll: true })
  }, [selectedId, inline])
  const activeOffer = entry?.status === 'OFFERED' && entry.offerStatus === 'OFFERED' && Boolean(entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) > now)
  const remaining = activeOffer && entry?.offerExpiresAt ? Math.max(0, Math.ceil((Date.parse(entry.offerExpiresAt) - now) / 1000)) : 0
  return <section ref={panel} className="gm-waitlist-details" aria-label="Detalji prijave" tabIndex={inline ? -1 : undefined}>
    {inline && <header className="gm-waitlist-panel-title"><h2>Detalji prijave</h2><Button type="button" variant="secondary" className="gm-waitlist-close" aria-label="Zatvori detalje" onClick={onClose}><WaitlistIcon kind="close" /></Button></header>}
    {error ? <ErrorState message={waitlistError(error, 'Detalje prijave nije moguće učitati.')} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
      : loading || !entry ? <Skeleton lines={8} label="Učitavanje detalja prijave" /> : <>
        <header className="gm-waitlist-detail-customer"><WaitlistAvatar name={entry.customerName} /><div><h3>{entry.customerName}</h3>
          {entry.customerEmail && <p>{entry.customerEmail}</p>}<Badge tone={entry.customerActive ? 'success' : 'neutral'}>{entry.customerActive ? 'Aktivan klijent' : 'Neaktivan klijent'}</Badge></div></header>
        <WaitlistStatusBadge entry={entry} now={now} />
        <div role="tablist" aria-label="Detalji prijave" className="gm-waitlist-tabs" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'information' : event.key === 'End' ? 'history' : tab === 'information' ? 'history' : 'information'
          setTab(next); document.getElementById(id + '-' + next)?.focus()
        }}>
          <button id={id + '-information'} type="button" role="tab" aria-selected={tab === 'information'} aria-controls={id + '-content-information'}
            tabIndex={tab === 'information' ? 0 : -1} onClick={() => setTab('information')}>Informacije</button>
          <button id={id + '-history'} type="button" role="tab" aria-selected={tab === 'history'} aria-controls={id + '-content-history'}
            tabIndex={tab === 'history' ? 0 : -1} onClick={() => setTab('history')}>Istorija</button>
        </div>
        <div id={id + '-content-information'} role="tabpanel" aria-labelledby={id + '-information'} hidden={tab !== 'information'}>
          <dl className="gm-waitlist-detail-list">
            <div><dt>ID prijave</dt><dd className="gm-waitlist-id">{entry.id}</dd></div>
            <div><dt>Klijent</dt><dd>{entry.customerName}</dd></div>
            <div><dt>Usluga</dt><dd>{entry.serviceName}<small>{entry.durationMinutes} min{entry.resourceType ? ' · ' + (resourceLabels[entry.resourceType] ?? entry.resourceType) : ''}</small></dd></div>
            <div><dt>Zaposleni</dt><dd>{entry.employeeName}</dd></div>
            <div><dt>Lokal</dt><dd>{entry.locationName || 'Bez određenog lokala'}</dd></div>
            <div><dt>Zona</dt><dd>{entry.areaName || 'Bez određene zone'}</dd></div>
            <div><dt>Resurs</dt><dd>{[entry.resourceCode, entry.resourceName].filter(Boolean).join(' · ') || 'Bez određenog resursa'}</dd></div>
            <div><dt>Željeni datum</dt><dd>{new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'Europe/Belgrade', dateStyle: 'long' }).format(new Date(entry.desiredStart))}</dd></div>
            <div><dt>Početak / kraj</dt><dd>{formatBusinessTime(entry.desiredStart)} – {entry.desiredEnd ? formatBusinessIntervalEnd(entry.desiredStart, entry.desiredEnd, 'sr-Latn-RS') : '—'}</dd></div>
            <div><dt>Datum prijave</dt><dd>{waitlistDate(entry.createdAt)}</dd></div>
            <div><dt>Ulazak u FIFO red</dt><dd>{waitlistDate(entry.queueEnteredAt)}</dd></div>
            <div><dt>Kreirao</dt><dd>{entry.createdByName || 'Nije evidentirano'}</dd></div>
            <div><dt>Saglasnost klijenta</dt><dd>{entry.consentAt ? waitlistDate(entry.consentAt) : 'Nije posebno evidentirana'}</dd></div>
          </dl>
          {canManage && !entry.readOnly && <section className="gm-waitlist-note"><h4>Interna napomena</h4><p>{entry.internalNote || 'Nema interne napomene.'}</p></section>}
          {activeOffer && <section className="gm-waitlist-offer"><h4><WaitlistIcon kind="offer" />Aktivna ponuda</h4><Badge tone="info">Ponuda poslata</Badge>
            <strong className="gm-waitlist-countdown" aria-label="Preostalo vreme za prihvatanje">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong>
            <dl><div><dt>Poslata</dt><dd>{entry.offerCreatedAt ? waitlistDate(entry.offerCreatedAt) : '—'}</dd></div>
              <div><dt>Ističe</dt><dd>{entry.offerExpiresAt ? waitlistDate(entry.offerExpiresAt) : '—'}</dd></div>
              <div><dt>Ponuđeni resurs</dt><dd>{entry.offeredResourceName || 'Bez određenog resursa'}</dd></div></dl>
            <p>Ponudu prihvata isključivo klijent. Termin se proverava ponovo pri prihvatanju.</p></section>}
          {entry.reservationId && <p className="gm-waitlist-form-help">Prihvaćena ponuda je povezana sa rezervacijom. <Link to={`/reservations?reservationId=${entry.reservationId}`}>Pogledaj rezervaciju</Link></p>}
          <p className="gm-waitlist-form-help">FIFO prati vreme ulaska i mogućnost oslobađanja celog termina. Numerička pozicija nije prikazana jer prijave mogu konkurisati za različite resurse i preklopljene termine.</p>
        </div>
        <div id={id + '-content-history'} role="tabpanel" aria-labelledby={id + '-history'} hidden={tab !== 'history'}>
          <ol className="gm-waitlist-history">{detail?.history.map(event => <li key={event.id}><span className="gm-waitlist-history-dot" aria-hidden="true" /><div>
            <strong>{historyLabels[event.type] ?? event.type}</strong><time dateTime={event.occurredAt}>{waitlistDate(event.occurredAt)}</time>
            <small>{event.actorName || 'Automatski sistem'}</small>{event.reason && <p>{event.reason}</p>}</div></li>)}</ol>
          {!detail?.history.length && <p>Za ovu prijavu nema zabeleženih događaja.</p>}
          <p className="gm-waitlist-form-help">Prikazani su evidentirani događaji. Za ranije prijave sačuvana su poznata vremena kreiranja prijave i ponuda.</p>
        </div>
        <footer className="gm-waitlist-detail-actions">
          {canManage && entry.allowedActions.includes('EDIT') && <Button type="button" variant="secondary" disabled={fetching} onClick={event => onEdit(entry, event.currentTarget)}><WaitlistIcon kind="edit" />Izmeni prijavu</Button>}
          {canManage && entry.allowedActions.includes('CANCEL') && <Button type="button" variant="danger" disabled={fetching} onClick={() => onCancel(entry)}><WaitlistIcon kind="cancel" />Otkaži prijavu</Button>}
          {entry.allowedActions.includes('CALENDAR') && <Link className="ui-button ui-button--secondary" to={waitlistCalendar(entry)}><WaitlistIcon kind="calendar" />Proveri kalendar</Link>}
          {entry.allowedActions.includes('CUSTOMER') && <Link className="ui-button ui-button--secondary" to={`/customers?customerId=${entry.customerId}`}><WaitlistIcon kind="customer" />Pogledaj klijenta</Link>}
          {(entry.readOnly || !canManage) && <p className="gm-waitlist-form-help">Prijava je dostupna samo za pregled.</p>}
          <Button type="button" variant="secondary" loading={fetching} onClick={onRefresh}><WaitlistIcon kind="refresh" />Osveži detalje</Button>
        </footer>
      </>}
  </section>
}
