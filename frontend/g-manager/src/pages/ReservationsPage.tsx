import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { reservationApi } from '../api/reservationApi'
import { useAuthStore } from '../auth/authStore'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { PageResponse } from '../types/api.types'
import type { Reservation, ReservationStatus } from '../types/reservation.types'

export function ReservationsPage() {
  const [renderedAt] = useState(() => Date.now())
  const user = useAuthStore((state) => state.user)
  const [result, setResult] = useState<PageResponse<Reservation> | null>(null)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<ReservationStatus | ''>('PENDING')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setResult(await reservationApi.list({
      page, size: 20, status: status || undefined,
      from: from || undefined, to: to || undefined,
    }))
  }, [from, page, status, to])

  useEffect(() => {
    void reservationApi.list({
      page, size: 20, status: status || undefined,
      from: from || undefined, to: to || undefined,
    }).then(setResult).catch((cause) =>
      setError(apiErrorMessage(cause, 'Rezervacije nije moguće učitati.')))
  }, [from, page, status, to])

  async function transition(reservation: Reservation, next: ReservationStatus) {
    let note: string | undefined
    if (next === 'REJECTED') note = window.prompt('Razlog odbijanja (opciono):') ?? undefined
    try {
      await reservationApi.changeStatus(reservation, next, note)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Status nije moguće promeniti.'))
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">Operativa</p><h1>Rezervacije</h1></div></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="filter-bar reservation-filters">
        <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value as ReservationStatus | ''); setPage(0) }}>
          <option value="">Svi</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) =>
            <option value={value} key={value}>{value}</option>)}</select></label>
        <label>Od<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Do<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      <section className="reservation-list">
        {!result?.content.length && <p className="empty-state">Nema rezervacija.</p>}
        {result?.content.map((reservation) => {
          const own = user?.role !== 'EMPLOYEE' || reservation.employeeId === user.id
          return <article className="panel reservation-row management" key={reservation.id}>
            <div><strong>{formatBusinessDateTime(reservation.startTime)}</strong>
              <p>Kupac: {reservation.customerId}</p><small>do {formatBusinessDateTime(reservation.endTime)}</small></div>
            <span className="status-badge neutral">{reservation.status}</span>
            {own && <div className="card-actions">
              {reservation.status === 'PENDING' && <>
                <button onClick={() => void transition(reservation, 'CONFIRMED')}>Potvrdi</button>
                <button className="danger-button" onClick={() => void transition(reservation, 'REJECTED')}>Odbij</button></>}
              {reservation.status === 'CONFIRMED' && <button
                disabled={renderedAt < new Date(reservation.endTime).getTime()}
                onClick={() => void transition(reservation, 'COMPLETED')}>Završi</button>}
              {(user?.role === 'OWNER' || user?.role === 'ADMIN')
                && (reservation.status === 'PENDING' || reservation.status === 'CONFIRMED')
                && <button className="danger-button" onClick={() => void transition(reservation, 'CANCELLED')}>Otkaži</button>}
            </div>}
          </article>
        })}
      </section>
      <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
        <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
        <button disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button></div>
    </main>
  )
}
