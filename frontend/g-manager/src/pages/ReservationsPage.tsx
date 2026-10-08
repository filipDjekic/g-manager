import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { resourceApi } from '../api/resourceApi'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { StaffReservationForm } from '../reservations/StaffReservationForm'
import { ReservationScopeSwitch } from '../reservations/ReservationScopeSwitch'
import { apiErrorMessage } from '../api/client'
import { reservationApi } from '../api/reservationApi'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { ReservationScope, ReservationStatus } from '../types/reservation.types'

const baseDefaults = {scope: 'ALL', resourceId: '', locationId: '', customerId: '', page: '0', status: 'PENDING', employeeId: '', from: '', to: '', sort: 'startTime', direction: 'ASC', reservationId: '' }
const allowed = ['scope', 'resourceId', 'locationId', 'customerId', 'page', 'status', 'employeeId', 'from', 'to', 'sort', 'direction', 'reservationId'] as const

export function ReservationsPage() {
  const actor=useAuthStore(state=>state.user)
  const defaults=useMemo(()=>({...baseDefaults,scope:actor?.role==='EMPLOYEE'?'MANAGEABLE':'ALL'}),[actor?.role])
  const url = useListUrlState(defaults, allowed)
  const scope:ReservationScope=url.state.scope==='MANAGEABLE'?'MANAGEABLE':'ALL'
  const [createOpen,setCreateOpen]=useState(false)
  const employees=useQuery({queryKey:['users','reservation-employees'],queryFn:userApi.employees})
  const resources=useQuery({queryKey:['resources','reservation-filters'],queryFn:resourceApi.reservationResources})
  const locations=useQuery({queryKey:['resources','locations'],queryFn:resourceApi.locations})
  const client = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const filters = useMemo(() => ({
    scope,resourceId:url.state.resourceId||undefined,locationId:url.state.locationId||undefined,customerId:url.state.customerId||undefined,
    page: Math.max(0, Number(url.state.page) || 0), size: 20,
    status: (url.state.status || undefined) as ReservationStatus | undefined,
    employeeId: url.state.employeeId || undefined, from: url.state.from || undefined, to: url.state.to || undefined,
    sort: url.state.sort as 'startTime' | 'status' | 'createdAt', direction: url.state.direction as 'ASC' | 'DESC',
  }), [url.state,scope])
  const result = useQuery({ queryKey: queryKeys.reservations(`${actor?.id}:${scope}:${url.query}`), queryFn: () => reservationApi.list(filters),refetchInterval:15000,refetchOnWindowFocus:true })
  const refresh = () => client.invalidateQueries({ queryKey: ['reservations'] })
  const bulk = useMutation({ mutationFn: async ({ status, reason }: { status: ReservationStatus; reason?: string }) => reservationApi.bulkStatus(status,
    (result.data?.content ?? []).filter(item => selected.has(item.id)&&item.allowedActions?.includes(status)).map(({ id, version }) => ({ id, version })), reason),
  onSuccess: async (response) => {
    setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`)
    setSelected(new Set()); await refresh()
  },onError:async()=>{setSelected(new Set());await refresh()} })
  const selectedItems=(result.data?.content??[]).filter(item=>selected.has(item.id))
  const mayBulk=(status:ReservationStatus)=>!result.error&&selectedItems.length>0&&selectedItems.length===selected.size&&selectedItems.every(item=>item.allowedActions?.includes(status))
  const error = result.error || bulk.error
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Termini</h1></div><Button onClick={()=>setCreateOpen(true)}>Nova rezervacija</Button></div>
    {actor?.role==='EMPLOYEE'&&<ReservationScopeSwitch scope={scope} onChange={scope=>{setSelected(new Set());url.set({scope,page:'0'})}}/>}
    {actor?.role==='EMPLOYEE'&&<p className="search-help">{scope==='MANAGEABLE'?'Rezervacije trenutno dodeljenih stanica.':'Pregled svih stanica. Upravljanje je dostupno samo na trenutno dodeljenim stanicama.'}</p>}
    <SavedViewBar resource="RESERVATIONS" query={{...url.queryObject,scope}} apply={query=>{setSelected(new Set());url.apply(query)}} />
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad rezervacijama nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    <div className="filter-bar reservation-filters">
      <label>Status<select value={url.state.status} onChange={(event) => {setSelected(new Set());url.set({ status: event.target.value, page: '0' })}}>
        <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
          <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Od<input type="date" value={url.state.from} onChange={(event) => {setSelected(new Set());url.set({ from: event.target.value, page: '0' })}} /></label>
      <label>Do<input type="date" value={url.state.to} onChange={(event) => {setSelected(new Set());url.set({ to: event.target.value, page: '0' })}} /></label>
      <label>Lokacija<select value={url.state.locationId} onChange={e=>{setSelected(new Set());url.set({locationId:e.target.value,page:'0'})}}><option value="">Sve lokacije</option>{locations.data?.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Računar / resurs<select value={url.state.resourceId} onChange={e=>{setSelected(new Set());url.set({resourceId:e.target.value,page:'0'})}}><option value="">Svi resursi</option>{resources.data?.filter(r=>!url.state.locationId||r.locationId===url.state.locationId).map(r=><option key={r.id} value={r.id}>{r.code} · {r.name} · {r.locationName}</option>)}</select></label>
      <label>Zaposleni<select value={url.state.employeeId} onChange={e=>{setSelected(new Set());url.set({employeeId:e.target.value,page:'0'})}}><option value="">Svi zaposleni</option>{employees.data?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <CustomerPicker value={url.state.customerId} onChange={customerId=>{setSelected(new Set());url.set({customerId,page:'0'})}}/>
      <label>Redosled<select value={`${url.state.sort}:${url.state.direction}`} onChange={(event) => {
        const [sort, direction] = event.target.value.split(':'); setSelected(new Set());url.set({ sort, direction, page: '0' })
      }}><option value="startTime:ASC">Najranije</option><option value="startTime:DESC">Najkasnije</option>
        <option value="createdAt:DESC">Najnoviji zahtev</option></select></label>
    </div>
    {bulkSummary&&<p role="status">{bulkSummary}</p>}
    <SelectionBar count={selected.size}>
      <Button loading={bulk.isPending}
        disabled={!mayBulk('CONFIRMED')}
        onClick={() => bulk.mutate({ status: 'CONFIRMED' })}>Potvrdi izabrane</Button>
      <Button variant="danger" disabled={!mayBulk('CANCELLED')} loading={bulk.isPending} onClick={() => setCancelOpen(true)}>Otkaži izabrane</Button>
    </SelectionBar>
    {result.isLoading ? <Skeleton lines={6} label="Učitavanje rezervacija" /> :
      !result.data?.content.length ? <EmptyState title="Nema rezervacija" description="Promenite filtere ili period." /> :
      <section className="reservation-list">{result.data.content.map((reservation) => {
        return <article className={`panel reservation-row management ${reservation.readOnly?'reservation-readonly':'reservation-manageable'}`} key={reservation.id}>
          <label className="row-selector"><input type="checkbox" checked={selected.has(reservation.id)}
            disabled={!reservation.allowedActions?.length||!!reservation.readOnly} onChange={() => toggle(reservation.id)} aria-label={`Izaberi rezervaciju ${reservation.id}`} /></label>
          <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong><p>{reservation.serviceName} · {reservation.customerName}</p><p>{reservation.resourceId ? `${reservation.resourceCode} · ${reservation.resourceName}` :
              reservation.resourceRequired ? 'Zahtevani resurs nije dodeljen' : 'Usluga bez fizičkog resursa'}</p>
            {reservation.locationName && <p>{reservation.locationName}</p>}
            {reservation.resourceRequired && !reservation.resourceId && <p className="error-banner">Potrebna je ručna dodela u detaljima rezervacije.</p>}
            <small>do {formatBusinessDateTime(reservation.endTime)}</small></div>
          <div className="reservation-tags"><span className="status-badge neutral">{reservation.status}</span>
            <span className={`status-badge ${reservation.readOnly?'neutral':'info'}`}>{reservation.readOnly?'Samo pregled':'Upravljanje'}</span></div>
          <Button variant="secondary" onClick={() => url.set({ reservationId: reservation.id })}>Detalji</Button>
        </article>
      })}</section>}
    <div className="pagination"><button disabled={filters.page === 0} onClick={() => {setSelected(new Set());url.set({ page: String(filters.page - 1) })}}>Prethodna</button>
      <span>Strana {filters.page + 1} od {Math.max(result.data?.totalPages ?? 1, 1)}</span>
      <button disabled={!result.data || filters.page + 1 >= result.data.totalPages} onClick={() => {setSelected(new Set());url.set({ page: String(filters.page + 1) })}}>Sledeća</button></div>
    {createOpen&&<StaffReservationForm onClose={()=>setCreateOpen(false)} onCreated={(id,summary)=>{setCreateOpen(false);setBulkSummary(summary??'');url.set({reservationId:id})}}/>}
    <ReservationDetailsDrawer reservationId={url.state.reservationId || null}
      onClose={() => url.set({ reservationId: '' }, true)} />
    <ActionDialog open={cancelOpen&&mayBulk('CANCELLED')} title="Otkaži izabrane rezervacije"
      description="Svaka dozvoljena promena biće odmah sačuvana i evidentirana."
      confirmLabel="Otkaži rezervacije" reasonLabel="Razlog" reasonRequired danger loading={bulk.isPending}
      onClose={() => setCancelOpen(false)} onConfirm={(reason) => {
        if (!reason||!mayBulk('CANCELLED')) return
        bulk.mutate({ status: 'CANCELLED', reason }, { onSuccess: () => setCancelOpen(false) })
      }} />
  </main>
}
