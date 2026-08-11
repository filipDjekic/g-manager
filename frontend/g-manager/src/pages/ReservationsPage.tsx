import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { reservationApi } from '../api/reservationApi'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import type { ReservationStatus } from '../types/reservation.types'

const defaults = { page: '0', status: 'PENDING', employeeId: '', from: '', to: '', sort: 'startTime', direction: 'ASC', reservationId: '' }
const allowed = ['page', 'status', 'employeeId', 'from', 'to', 'sort', 'direction', 'reservationId'] as const

export function ReservationsPage() {
  const url = useListUrlState(defaults, allowed)
  const client = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const filters = useMemo(() => ({
    page: Math.max(0, Number(url.state.page) || 0), size: 20,
    status: (url.state.status || undefined) as ReservationStatus | undefined,
    employeeId: url.state.employeeId || undefined, from: url.state.from || undefined, to: url.state.to || undefined,
    sort: url.state.sort as 'startTime' | 'status' | 'createdAt', direction: url.state.direction as 'ASC' | 'DESC',
  }), [url.state])
  const result = useQuery({ queryKey: queryKeys.reservations(url.query), queryFn: () => reservationApi.list(filters) })
  const refresh = () => client.invalidateQueries({ queryKey: ['reservations'] })
  const bulk = useMutation({ mutationFn: async (status: ReservationStatus) => reservationApi.bulkStatus(status,
    (result.data?.content ?? []).filter(({ id }) => selected.has(id)).map(({ id, version }) => ({ id, version }))),
  onSuccess: async (response) => {
    setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`)
    setSelected(new Set()); await refresh()
  } })
  const error = result.error || bulk.error
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Rezervacije</h1></div></div>
    <SavedViewBar resource="RESERVATIONS" query={url.queryObject} apply={url.apply} />
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad rezervacijama nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    <div className="filter-bar reservation-filters">
      <label>Status<select value={url.state.status} onChange={(event) => url.set({ status: event.target.value, page: '0' })}>
        <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
          <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Od<input type="date" value={url.state.from} onChange={(event) => url.set({ from: event.target.value, page: '0' })} /></label>
      <label>Do<input type="date" value={url.state.to} onChange={(event) => url.set({ to: event.target.value, page: '0' })} /></label>
      <label>Redosled<select value={`${url.state.sort}:${url.state.direction}`} onChange={(event) => {
        const [sort, direction] = event.target.value.split(':'); url.set({ sort, direction, page: '0' })
      }}><option value="startTime:ASC">Najranije</option><option value="startTime:DESC">Najkasnije</option>
        <option value="createdAt:DESC">Najnoviji zahtev</option></select></label>
    </div>
    <SelectionBar count={selected.size} summary={bulkSummary}>
      <Button loading={bulk.isPending} onClick={() => bulk.mutate('CONFIRMED')}>Potvrdi izabrane</Button>
      <Button variant="danger" loading={bulk.isPending} onClick={() => bulk.mutate('CANCELLED')}>Otkaži izabrane</Button>
    </SelectionBar>
    {result.isLoading ? <Skeleton lines={6} label="Učitavanje rezervacija" /> :
      !result.data?.content.length ? <EmptyState title="Nema rezervacija" description="Promenite filtere ili period." /> :
      <section className="reservation-list">{result.data.content.map((reservation) => {
        return <article className="panel reservation-row management" key={reservation.id}>
          <label className="row-selector"><input type="checkbox" checked={selected.has(reservation.id)}
            onChange={() => toggle(reservation.id)} aria-label={`Izaberi rezervaciju ${reservation.id}`} /></label>
          <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong><p>Detalji klijenta i usluge</p>
            <small>do {formatBusinessDateTime(reservation.endTime)}</small></div>
          <span className="status-badge neutral">{reservation.status}</span>
          <Button variant="secondary" onClick={() => url.set({ reservationId: reservation.id })}>Detalji</Button>
        </article>
      })}</section>}
    <div className="pagination"><button disabled={filters.page === 0} onClick={() => url.set({ page: String(filters.page - 1) })}>Prethodna</button>
      <span>Strana {filters.page + 1} od {Math.max(result.data?.totalPages ?? 1, 1)}</span>
      <button disabled={!result.data || filters.page + 1 >= result.data.totalPages} onClick={() => url.set({ page: String(filters.page + 1) })}>Sledeća</button></div>
    <ReservationDetailsDrawer reservationId={url.state.reservationId || null}
      onClose={() => url.set({ reservationId: '' }, true)} />
  </main>
}
