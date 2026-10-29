import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/dashboardApi'
import { orderApi } from '../api/orderApi'
import { reservationApi } from '../api/reservationApi'
import { apiErrorMessage } from '../api/client'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { formatBusinessTime } from '../reservations/dateTime'
import { dashboardActionLabels, formatDashboardMoney } from './presentation'
import { useOrderActionConfirmation } from '../order/useOrderActionConfirmation'
import type { DashboardToday } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'

export function EmployeeWorkdaySummary() {
  const user = useAuthStore(state => state.user), client = useQueryClient()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false)
  const lock = useRef(false), { confirm, confirmationDialog } = useConfirmDialog(), orders = useOrderActionConfirmation()
  const result = useQuery({ queryKey: ['dashboard', 'today', user?.id], queryFn: dashboardApi.today,
    enabled: hasCapability(user, 'DASHBOARD_OPERATIONAL'), refetchInterval: 30000, refetchIntervalInBackground: false })
  async function perform(commit: () => Promise<unknown>) {
    if (lock.current) throw new Error('Sačekajte završetak prethodne akcije.')
    lock.current = true; setBusy(true); setError('')
    try { await commit(); await Promise.all(['dashboard', 'orders', 'reservations', 'waitlist'].map(key => client.invalidateQueries({ queryKey: [key] }))) }
    catch (cause) { setError(apiErrorMessage(cause, 'Promena nije potvrđena. Osvežite podatke pre nove akcije.')); throw cause }
    finally { lock.current = false; setBusy(false) }
  }
  function appointment(item: DashboardToday['appointments'][number], next: ReservationStatus) {
    if (!hasCapability(user, 'RESERVATION_CHANGE_STATUS') || !item.allowedActions.includes(next)) return
    if (next === 'CANCELLED' || next === 'REJECTED') confirm({ title: `${dashboardActionLabels[next]} termin`,
      description: `${item.customerName} · ${item.serviceName}`, variant: 'danger', reasonLabel: 'Razlog', reasonRequired: true,
      onConfirm: reason => perform(() => reservationApi.changeStatus(item, next, reason)) })
    else void perform(() => reservationApi.changeStatus(item, next)).catch(() => {})
  }
  useDirtyGuard(busy, { pending: busy })
  if (!hasCapability(user, 'DASHBOARD_OPERATIONAL')) return null
  const data = result.data
  return <section className="workday-summary" aria-label="Dnevni zadaci">{confirmationDialog}{orders.confirmationDialog}
    {error && <ErrorState title="Akcija nije potvrđena" message={error} />}
    {result.isLoading ? <Skeleton lines={3} label="Učitavanje dnevnih zadataka" /> : result.error ? <ErrorState title="Dnevni zadaci nisu osveženi"
      message="Rad sa računarima ostaje dostupan. Pokušajte ponovo da učitate termine i narudžbine."
      action={<Button variant="secondary" onClick={() => result.refetch()}>Pokušaj ponovo</Button>} /> : data && <>
      {data.attentionNotifications.some(item=>item.priority==='HIGH')&&<div className="ui-alert ui-alert--warning" role="status">{data.attentionNotifications.filter(item=>item.priority==='HIGH').map(item=><p key={item.id}><strong>{item.title}</strong> · {item.body}</p>)}</div>}
      <p className="ui-workspace-scope">Termini iz vašeg dnevnog rasporeda i narudžbine dostupne vašem nalogu.</p>
      <div className="ui-hub-grid">
        {hasCapability(user, 'RESERVATION_READ_ALL') && <Card><header className="section-heading"><h2>Današnji termini</h2><Link to="/calendar">Raspored →</Link></header>
          {!data.appointments.length ? <EmptyState title="Nema današnjih termina" /> : <ul className="ui-task-list">{data.appointments.slice(0, expanded ? undefined : 4).map(item => <li key={item.id}>
            <div><strong>{formatBusinessTime(item.startTime)} · {item.customerName}</strong><small>{item.serviceName} · do {formatBusinessTime(item.endTime)}</small></div>
            <Badge tone={reservationTones[item.status]}>{reservationLabels[item.status]}</Badge>
            <div className="ui-actions">{hasCapability(user, 'RESERVATION_CHANGE_STATUS') && item.allowedActions.map(next => <Button key={next} disabled={busy || result.isFetching}
              variant={next === 'CANCELLED' || next === 'REJECTED' ? 'danger' : 'secondary'} onClick={() => appointment(item, next)}>{dashboardActionLabels[next] ?? next}</Button>)}
              <Link to={`/reservations?reservationId=${item.id}`}>Detalji</Link></div>
          </li>)}</ul>}
        </Card>}
        {hasCapability(user, 'ORDER_READ_ALL') && <Card><header className="section-heading"><h2>Narudžbine koje čekaju</h2><Link to="/orders">Sve narudžbine →</Link></header>
          {!data.unclaimedOrders.length && !data.assignedOrders.length ? <EmptyState title="Nema narudžbina za obradu" /> : <ul className="ui-task-list">{[...data.unclaimedOrders, ...data.assignedOrders].slice(0, expanded ? undefined : 4).map(item => <li key={item.id}>
            <strong>#{item.id.slice(0, 8)} · {formatDashboardMoney(item.totalPrice)}</strong><div className="ui-actions">{hasCapability(user, 'ORDER_CHANGE_STATUS') && item.allowedActions.map(next =>
              <Button key={next} variant={next === 'CANCELLED' ? 'danger' : 'secondary'} disabled={busy || result.isFetching}
                onClick={() => orders.request(item, next, () => perform(() => orderApi.changeStatus(item, next)))}>{dashboardActionLabels[next] ?? next}</Button>)}</div>
          </li>)}</ul>}
        </Card>}
      </div>
      <details className="ui-advanced-filters" onToggle={event => setExpanded(event.currentTarget.open)}><summary>Ceo dnevni pregled i važni događaji</summary>
        <p>Radno vreme {data.workingDayStart && formatBusinessTime(data.workingDayStart)}–{data.workingDayEnd && formatBusinessTime(data.workingDayEnd)} · {data.timezone}</p>
        <h3>Važni događaji</h3>{data.attentionNotifications.length ? <ul className="ui-task-list">{data.attentionNotifications.map(item => <li key={item.id}>
          <Badge tone={item.priority === 'HIGH' ? 'danger' : 'info'}>{item.priority === 'HIGH' ? 'Važno' : 'Obaveštenje'}</Badge><strong>{item.title}</strong><p>{item.body}</p>
        </li>)}</ul> : <p>Nema novih važnih događaja.</p>}
        <h3>Slobodni intervali dnevnog rasporeda</h3><p>Ovi intervali nisu potvrda dostupnosti konkretnog računara.</p>
        <ul>{data.gaps.map(gap => <li key={gap.startTime}>{formatBusinessTime(gap.startTime)}–{formatBusinessTime(gap.endTime)}</li>)}</ul>
      </details>
    </>}
  </section>
}
