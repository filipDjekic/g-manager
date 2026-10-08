import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { waitlistApi } from '../api/waitlistApi'
import { resourceApi } from '../api/resourceApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, TableShell } from '../components/ui'
import { useListUrlState } from '../lists/useListUrlState'
import { dateInBusinessZone, formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { useServerNow } from '../gaming/useServerNow'
import type { WaitlistStatus } from '../types/waitlist.types'

const defaults = { search: '', status: '', page: '0', customerId: '', date: '', locationId: '', resourceId: '' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]
const labels: Record<WaitlistStatus, string> = { WAITING: 'Čeka termin', OFFERED: 'Ponuda poslata', ACCEPTED: 'Prihvaćeno', CANCELLED: 'Otkazano' }
export function WaitlistPage() {
  const url = useListUrlState(defaults, allowed), page = Math.max(0, Number(url.state.page) || 0)
  const status = Object.hasOwn(labels, url.state.status) ? url.state.status as WaitlistStatus : undefined
  const filters = useQuery({ queryKey: ['resources', 'waitlist-filters'], queryFn: resourceApi.reservationResources })
  const resources = filters.data ?? []
  const locations = [...new Map(resources.map(item => [item.locationId, item.locationName])).entries()]
  const queue = useQuery({ queryKey: ['waitlist', 'operational', url.query], queryFn: () => waitlistApi.operational({
    search: url.state.search || undefined, status, customerId: url.state.customerId || undefined,
    date: url.state.date || undefined, locationId: url.state.locationId || undefined, resourceId: url.state.resourceId || undefined, page, size: 20,
  }), refetchInterval: 15000, refetchIntervalInBackground: false })
  const serverTime = queue.data?.content[0]?.serverTime
  const now = useServerNow(serverTime)
  return <main className="workspace">
    <PageHeader eyebrow="Operativa" title="Lista čekanja" actions={<Button variant="secondary" loading={queue.isFetching} onClick={() => queue.refetch()}>Osveži</Button>} />
    <p className="search-help">Pregled svih stanica, od najstarije prijave. Ponudu prihvata isključivo klijent; operativna lista služi za pregled. Oznaka stanice prati vaše trenutne dodele i prava u kalendaru.</p>
    <div className="filter-bar customer-filters waitlist-filters">
      <label>Pretraga<input maxLength={100} placeholder="Klijent, usluga, lokacija ili resurs" value={url.state.search} onChange={e => url.set({ search: e.target.value, page: '0' }, true)} /></label>
      <label>Status<select value={status ?? ''} onChange={e => url.set({ status: e.target.value, page: '0' })}><option value="">Sve aktivne prijave</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Datum termina<input type="date" value={url.state.date} onChange={e => url.set({ date: e.target.value, page: '0' })} /></label>
      <label>Lokacija<select value={url.state.locationId} disabled={filters.isLoading} onChange={e => url.set({ locationId: e.target.value, resourceId: '', page: '0' })}><option value="">Sve lokacije</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Stanica / resurs<select value={url.state.resourceId} disabled={filters.isLoading} onChange={e => url.set({ resourceId: e.target.value, page: '0' })}><option value="">Sve stanice</option>{resources.filter(item => !url.state.locationId || item.locationId === url.state.locationId).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <CustomerPicker value={url.state.customerId} onChange={id => url.set({ customerId: id, page: '0' })} />
      <Button variant="secondary" onClick={() => url.apply({})}>Poništi filtere</Button>
    </div>
    {filters.error && <ErrorState message="Filtere stanica nije moguće učitati." action={<Button onClick={() => filters.refetch()}>Pokušaj ponovo</Button>} />}
    {queue.isLoading ? <Skeleton lines={5} label="Učitavanje liste čekanja" /> : queue.error ? <ErrorState message={apiErrorMessage(queue.error, 'Lista čekanja nije dostupna.')} action={<Button onClick={() => queue.refetch()}>Pokušaj ponovo</Button>} /> : !queue.data?.content.length ?
      <EmptyState title="Nema prijava za izabrani pregled" description="Prijave i ponude će se pojaviti ovde kada klijenti uđu na listu čekanja." action={<Button variant="secondary" onClick={() => url.apply({})}>Poništi filtere</Button>} /> :
      <TableShell label="Operativna lista čekanja"><table className="responsive-table"><thead><tr><th>Klijent / prijava</th><th>Usluga / termin</th><th>Lokacija / stanica</th><th>Status / ponuda</th><th>Pristup</th></tr></thead>
        <tbody>{queue.data.content.map(entry => {
          const expired = entry.offerStatus === 'EXPIRED' || Boolean(serverTime && entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= now)
          const offered = entry.status === 'OFFERED' && !expired
          return <tr key={entry.id}><td data-label="Klijent"><Link to={`/customers?customerId=${entry.customerId}`}>{entry.customerName}</Link><small className="table-secondary">Prijava: {formatBusinessDateTime(entry.createdAt)}</small></td>
            <td data-label="Termin"><strong>{entry.serviceName}</strong><small className="table-secondary">{formatBusinessDateTime(entry.desiredStart)}{entry.desiredEnd && ` – ${formatBusinessTime(entry.desiredEnd)}`}</small><small className="table-secondary">{entry.employeeName}</small></td>
            <td data-label="Stanica"><span>{[entry.resourceCode, entry.resourceName].filter(Boolean).join(' · ') || 'Bez određenog resursa'}</span><small className="table-secondary">{entry.locationName || 'Bez određene lokacije'}</small></td>
            <td data-label="Status"><Badge tone={offered || entry.status === 'ACCEPTED' ? 'success' : entry.status === 'CANCELLED' ? 'neutral' : 'warning'}>{entry.status === 'OFFERED' && expired ? 'Ponuda istekla · čeka novu proveru' : labels[entry.status]}</Badge>
              {entry.offerStatus && <small className="table-secondary">Ponuda: {entry.offerStatus === 'ACCEPTED' ? 'prihvaćena' : expired ? 'istekla' : 'aktivna'}</small>}
              {entry.offerExpiresAt && <small className="table-secondary">Rok: {formatBusinessDateTime(entry.offerExpiresAt, true)}</small>}</td>
            <td data-label="Pristup"><Badge tone={entry.stationManageable ? 'info' : 'neutral'}>{entry.stationManageable ? 'Stanica u vašem opsegu' : 'Samo pregled stanice'}</Badge>
              <small className="table-secondary">Lista čekanja: samo pregled</small>
              <Link to={`/calendar?${new URLSearchParams({ employeeId: entry.employeeId, date: dateInBusinessZone(entry.desiredStart), view: 'day', ...(entry.resourceId ? { resourceId: entry.resourceId } : {}), ...(entry.locationId ? { locationId: entry.locationId } : {}) })}`}>Proveri kalendar</Link></td></tr>
        })}</tbody></table></TableShell>}
    <div className="pagination"><Button variant="secondary" disabled={page === 0 || queue.isFetching} onClick={() => url.set({ page: String(page - 1) })}>Prethodna</Button>
      <span>{queue.data ? `${queue.data.totalElements} prijava · ` : ''}Strana {page + 1} od {Math.max(queue.data?.totalPages ?? 1, 1)}</span><Button variant="secondary" disabled={!queue.data || page + 1 >= queue.data.totalPages || queue.isFetching} onClick={() => url.set({ page: String(page + 1) })}>Sledeća</Button></div>
  </main>
}
