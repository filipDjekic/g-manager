import { Badge, Button, EmptyState, ErrorState, Skeleton, Card } from '../../components/ui'
import type { WaitlistEntry } from '../../types/waitlist.types'
import { formatBusinessDateTime, formatBusinessIntervalEnd } from '../dateTime'
import { CustomerReservationIcon } from './customerPresentation'
import { customerReservationError } from './customerPresentation.model'

export function CustomerWaitlist({ entries, now, synchronized, loading, fetching, error, pending, linkedOffer, onRefresh, onAccept, onCancel, onBook }: {
  entries: WaitlistEntry[]; now: number; synchronized: boolean; loading: boolean; fetching: boolean; error: unknown; pending: string; linkedOffer: string | null
  onRefresh: () => void; onAccept: (value: WaitlistEntry) => void; onCancel: (value: WaitlistEntry) => void; onBook?: () => void
}) {
  return <section className="gm-my-waitlist" aria-labelledby="my-waitlist-title"><header><div><h2 id="my-waitlist-title">Lista čekanja</h2><p>Ponude oslobođenih termina zahtevaju vašu potvrdu.</p></div>
    <Button type="button" variant="secondary" loading={fetching} onClick={onRefresh}><CustomerReservationIcon kind="refresh" />Osveži</Button></header>
    {loading && <div className="gm-my-reservation-grid"><Skeleton lines={5} label="Učitavanje liste čekanja" /><Skeleton lines={5} label="Učitavanje liste čekanja" /></div>}
    {error ? <ErrorState message={customerReservationError(error, 'Listu čekanja nije moguće osvežiti.')} action={<Button variant="secondary" type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} /> : null}
    {!loading && !error && !entries.length && <EmptyState title="Nemate prijave na listi čekanja" description="U novoj rezervaciji izaberite zauzet termin i prijavite se na listu čekanja." action={onBook && <Button type="button" onClick={onBook}>+ Nova rezervacija</Button>} />}
    <div className="gm-my-reservation-grid">{entries.map(entry => {
      const expired = entry.offerStatus === 'EXPIRED' || Boolean(synchronized && (entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now || Date.parse(entry.desiredStart) <= now))
      const active = entry.status === 'OFFERED' && !expired && synchronized && Boolean(entry.offerExpiresAt) && Date.parse(entry.desiredStart) > now
      const seconds = synchronized && entry.offerExpiresAt ? Math.max(0, Math.ceil((Date.parse(entry.offerExpiresAt) - now) / 1000)) : null
      const labels = { WAITING: 'Čeka termin', OFFERED: expired ? 'Ponuda istekla' : active ? 'Ponuda čeka odgovor' : 'Provera ponude', ACCEPTED: 'Prihvaćeno', CANCELLED: 'Otkazano' }
      return <Card as="article" tabIndex={entry.offerId === linkedOffer ? -1 : undefined} className={`gm-my-waitlist-card${active ? ' is-offered' : ''}${entry.offerId === linkedOffer ? ' is-linked' : ''}`} key={entry.id} id={entry.offerId ? `offer-${entry.offerId}` : undefined}>
        <header><CustomerReservationIcon kind="clock" /><Badge tone={active || entry.status === 'ACCEPTED' ? 'success' : expired && entry.status === 'OFFERED' ? 'warning' : 'neutral'}>{labels[entry.status]}</Badge></header>
        <h3>{entry.serviceName || 'Usluga'}</h3><p>{formatBusinessDateTime(entry.desiredStart, false, 'sr-Latn-RS')}{entry.desiredEnd && ` – ${formatBusinessIntervalEnd(entry.desiredStart, entry.desiredEnd, 'sr-Latn-RS')}`}</p>
        <p>{[entry.locationName, entry.resourceCode, entry.resourceName, entry.employeeName].filter(Boolean).join(' · ') || 'Resurs nije određen'}</p>
        {entry.status === 'OFFERED' && entry.offerExpiresAt && <small>Rok za prihvatanje: {formatBusinessDateTime(entry.offerExpiresAt, true, 'sr-Latn-RS')}</small>}
        {entry.status === 'OFFERED' && !expired && <div className="gm-my-offer-countdown" role="timer" aria-label="Preostalo vreme ponude">{seconds === null ? 'Sinhronizacija vremena…' : `Preostalo ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div>}
        {expired && ['OFFERED', 'WAITING'].includes(entry.status) && <p className="gm-my-reservation-warning">{Date.parse(entry.desiredStart) <= now
          ? 'Izabrani termin je prošao. Ova prijava više nema važeću ponudu.'
          : 'Ponuda je istekla. Prijava ostaje na listi čekanja za novu proveru dostupnosti.'}</p>}
        <footer>{entry.status === 'OFFERED' && <Button type="button" loading={pending === entry.id} disabled={!active || Boolean(pending) || Boolean(error)} onClick={() => onAccept(entry)}>Prihvati termin</Button>}
          {['WAITING', 'OFFERED'].includes(entry.status) && <Button type="button" variant="danger" disabled={Boolean(pending)} onClick={() => onCancel(entry)}>Otkaži prijavu</Button>}</footer>
      </Card>
    })}</div>
  </section>
}
