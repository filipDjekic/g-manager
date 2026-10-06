import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { waitlistApi } from '../api/waitlistApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, TableShell } from '../components/ui'
import { useListUrlState } from '../lists/useListUrlState'
import { dateInBusinessZone, formatBusinessDateTime } from '../reservations/dateTime'
import { useServerNow } from '../gaming/useServerNow'

const defaults = { search: '', status: '', page: '0', customerId: '' }
const allowed = Object.keys(defaults) as (keyof typeof defaults)[]
export function WaitlistPage() {
  const url = useListUrlState(defaults, allowed), page = Math.max(0, Number(url.state.page) || 0)
  const now=useServerNow()
  const status = url.state.status === 'WAITING' || url.state.status === 'OFFERED' ? url.state.status : undefined
  const queue = useQuery({ queryKey: ['waitlist', 'operational', url.query], queryFn: () => waitlistApi.operational({
    search: url.state.search || undefined, status, customerId: url.state.customerId || undefined, page, size: 20,
  }), refetchInterval: 30000, refetchIntervalInBackground: false })
  return <main className="workspace">
    <PageHeader eyebrow="Operativa" title="Lista čekanja" actions={<Button variant="secondary" loading={queue.isFetching} onClick={() => queue.refetch()}>Osveži</Button>} />
    <p className="search-help">Aktivne prijave za buduće termine, od najstarije. Ponude se šalju klijentima kada sistem pronađe slobodan termin.</p>
    <div className="filter-bar customer-filters"><label>Pretraga<input maxLength={100} placeholder="Klijent, usluga ili resurs" value={url.state.search} onChange={(e) => url.set({search:e.target.value,page:'0'},true)} /></label>
      <label>Stanje<select value={status ?? ''} onChange={(e) => url.set({status:e.target.value,page:'0'})}><option value="">Sve aktivne prijave</option><option value="WAITING">Čeka termin</option><option value="OFFERED">Ponuda poslata</option></select></label></div>
    {url.state.customerId && <Button variant="secondary" onClick={() => url.set({customerId:'',page:'0'})}>Prikaži sve klijente</Button>}
    {queue.isLoading ? <Skeleton lines={5} label="Učitavanje liste čekanja" /> : queue.error ? <ErrorState message={apiErrorMessage(queue.error,'Lista čekanja nije dostupna.')} action={<Button onClick={() => queue.refetch()}>Pokušaj ponovo</Button>} /> : !queue.data?.content.length ?
      <EmptyState title="Nema prijava za izabrani pregled" description="Ponude i prijave će se pojaviti ovde kada klijenti uđu na listu čekanja." action={<Button variant="secondary" onClick={() => url.apply({})}>Poništi filtere</Button>} /> :
      <TableShell label="Operativna lista čekanja"><table className="responsive-table"><thead><tr><th>Klijent / čeka od</th><th>Usluga / termin</th><th>Resurs / zaposleni</th><th>Ponuda</th><th>Akcije</th></tr></thead>
        <tbody>{queue.data.content.map((entry) => <tr key={entry.id}><td data-label="Klijent"><Link to={`/customers?customerId=${entry.customerId}`}>{entry.customerName}</Link><small className="table-secondary">{formatBusinessDateTime(entry.createdAt)}</small></td>
          <td data-label="Termin"><strong>{entry.serviceName}</strong><small className="table-secondary">{formatBusinessDateTime(entry.desiredStart)}</small></td>
          <td data-label="Resurs"><span>{entry.resourceName ?? 'Bez određenog resursa'}</span><small className="table-secondary">{[entry.locationName,entry.employeeName].filter(Boolean).join(' · ')}</small></td>
          <td data-label="Ponuda"><Badge tone={entry.status === 'OFFERED'&&(!entry.offerExpiresAt||Date.parse(entry.offerExpiresAt)>now) ? 'success' : 'warning'}>{entry.status === 'OFFERED' ? entry.offerExpiresAt&&Date.parse(entry.offerExpiresAt)<=now?'Ponuda istekla · čeka novu proveru':'Slobodan termin · ponuda poslata' : 'Čeka termin'}</Badge>
            {entry.offerExpiresAt && <small className="table-secondary">Važi do {formatBusinessDateTime(entry.offerExpiresAt)}</small>}</td>
          <td data-label="Akcije"><Link to={`/calendar?employeeId=${entry.employeeId}&date=${dateInBusinessZone(entry.desiredStart)}&view=day`}>Proveri kalendar</Link></td></tr>)}</tbody></table></TableShell>}
    <div className="pagination"><Button variant="secondary" disabled={page === 0 || queue.isFetching} onClick={() => url.set({page:String(page-1)})}>Prethodna</Button>
      <span>{queue.data ? `${queue.data.totalElements} prijava · ` : ''}Strana {page+1} od {Math.max(queue.data?.totalPages ?? 1,1)}</span><Button variant="secondary" disabled={!queue.data || page+1 >= queue.data.totalPages || queue.isFetching} onClick={() => url.set({page:String(page+1)})}>Sledeća</Button></div>
  </main>
}
