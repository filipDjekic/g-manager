import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { GamingOverview } from '../gaming/GamingOverview'
import { formatBusinessTime } from '../reservations/dateTime'
import type { DashboardToday, DashboardTodayOrder } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'
import type { OrderStatus } from '../types/order.types'
import { DashboardHeader, DashboardMetricCard, DashboardOrderCard, DashboardQuickActions, DashboardSection } from './DashboardComponents'
import { dashboardActionLabels } from './presentation'

export function EmployeeDashboard({ today, busy, refreshing, error, onRefresh, onAppointmentAction, onOrderAction, children }: {
  today: DashboardToday; busy: boolean; refreshing: boolean; error: string; onRefresh: () => void
  onAppointmentAction: (item: DashboardToday['appointments'][number], action: ReservationStatus) => void
  onOrderAction: (order: DashboardTodayOrder, action: OrderStatus) => void; children?: ReactNode
}) {
  const user = useAuthStore((state) => state.user)
  const canAppointments = hasCapability(user, 'RESERVATION_READ_ALL')
  const canOrders = hasCapability(user, 'ORDER_READ_ALL')
  const canChangeAppointments = hasCapability(user, 'RESERVATION_CHANGE_STATUS')
  const canChangeOrders = hasCapability(user, 'ORDER_CHANGE_STATUS')
  const appointments = [...today.appointments].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const highPriority = today.attentionNotifications.some((item) => item.priority === 'HIGH')

  function renderOrders(orders: DashboardTodayOrder[], emptyTitle: string) {
    return !orders.length ? <EmptyState title={emptyTitle} /> : <div className="dashboard-order-list">
      {orders.map((order) => <DashboardOrderCard key={order.id} order={order}>
        {canChangeOrders && order.allowedActions.map((action) => <Button key={action} type="button"
          variant={action === 'CANCELLED' ? 'danger' : 'primary'} disabled={busy}
          onClick={() => onOrderAction(order, action)}>{dashboardActionLabels[action] ?? action}</Button>)}
        {(!canChangeOrders || !order.allowedActions.length) && <span className="dashboard-read-only">Nema dostupnih promena</span>}
      </DashboardOrderCard>)}
    </div>
  }

  return <main className="workspace g-dashboard dashboard-workday">
    {children}
    <DashboardHeader title="Moj radni dan" eyebrow="Dnevna operativa" date={today.date} timezone={today.timezone}
      description="Termini, narudžbine i zadaci koji su danas pred vama." onRefresh={onRefresh} loading={refreshing}>
      {today.workingDayStart && today.workingDayEnd && <span>Radno vreme igraonice: {formatBusinessTime(today.workingDayStart)}–{formatBusinessTime(today.workingDayEnd)}</span>}
    </DashboardHeader>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="dashboard-kpis" aria-label="Pregled radnog dana">
      {canAppointments && <DashboardMetricCard label="Današnji termini" value={today.appointments.length} icon="/calendar"
        detail="Svi statusi u vašem dnevnom rasporedu" />}
      {canOrders && <>
        <DashboardMetricCard label="Nepreuzete narudžbine" value={today.unclaimedOrders.length} icon="/orders" tone="warning" detail="U dostupnom pregledu" />
        <DashboardMetricCard label="Moje narudžbine u obradi" value={today.assignedOrders.length} icon="/orders" detail="U dostupnom pregledu" />
      </>}
      <DashboardMetricCard label="Zahteva pažnju" value={today.attentionNotifications.length} icon="/notification-preferences"
        tone={highPriority ? 'danger' : 'neutral'} detail={highPriority ? 'Postoje obaveštenja visokog prioriteta' : 'Današnja obaveštenja'} />
    </div>
    {hasCapability(user, 'GAMING_SESSION_READ') && <div className="dashboard-gaming"><GamingOverview /></div>}
    <div className="dashboard-workday-grid">
      {canAppointments && <DashboardSection title="Današnji termini" icon="/calendar" className="dashboard-appointments"
        description={`${appointments.length} termina u dnevnom rasporedu`} actions={<Link to="/calendar">Otvori kalendar →</Link>}>
        {!appointments.length ? <EmptyState title="Danas nema termina" description="Radni dan je trenutno slobodan." /> :
          <ol className="dashboard-timeline">{appointments.map((item) => <li key={item.id}>
            <div className="dashboard-timeline-time"><time dateTime={item.startTime}>{formatBusinessTime(item.startTime)}</time>
              <time dateTime={item.endTime}>{formatBusinessTime(item.endTime)}</time></div>
            <article className={`dashboard-appointment dashboard-appointment--${item.status.toLowerCase()}`}>
              <div className="dashboard-appointment-heading"><strong>{item.serviceName}</strong>
                <Badge tone={reservationTones[item.status]}>{reservationLabels[item.status]}</Badge></div>
              <p>{item.customerName}</p>
              <div className="card-actions">
                {canChangeAppointments && item.allowedActions.map((action) => <Button key={action} type="button"
                  variant={action === 'CANCELLED' || action === 'REJECTED' ? 'danger' : 'primary'}
                  disabled={busy} onClick={() => onAppointmentAction(item, action)}>{dashboardActionLabels[action] ?? action}</Button>)}
                {(!canChangeAppointments || !item.allowedActions.length) && <span className="dashboard-read-only">Nema dostupnih promena</span>}
              </div>
            </article>
          </li>)}</ol>}
      </DashboardSection>}
      <div className="dashboard-workday-side">
        <DashboardSection title="Zahteva pažnju" icon="/notification-preferences" description="Obaveštenja za današnji radni dan">
          {!today.attentionNotifications.length ? <EmptyState title="Nema novih obaveštenja za danas." /> :
            <ul className="dashboard-notifications">{[...today.attentionNotifications]
              .sort((a, b) => Number(b.priority === 'HIGH') - Number(a.priority === 'HIGH')).map((item) => <li key={item.id}
                className={item.priority === 'HIGH' ? 'dashboard-notification--high' : undefined}>
                <Badge tone={item.priority === 'HIGH' ? 'danger' : item.priority === 'NORMAL' ? 'info' : 'neutral'}>
                  {item.priority === 'HIGH' ? 'Visok prioritet' : item.priority === 'NORMAL' ? 'Obaveštenje' : 'Informacija'}
                </Badge><strong>{item.title}</strong><p>{item.body}</p>
              </li>)}</ul>}
        </DashboardSection>
        {canAppointments && <DashboardSection title="Slobodni intervali" icon="/waitlist" description="Dostupni razmaci u radnom vremenu">
          {!today.gaps.length ? <EmptyState title="Nema slobodnih intervala u podešenom radnom vremenu." /> :
            <ul className="dashboard-gaps">{today.gaps.map((gap) => <li key={gap.startTime}>
              <time dateTime={gap.startTime}>{formatBusinessTime(gap.startTime)}</time><span aria-hidden="true">–</span>
              <time dateTime={gap.endTime}>{formatBusinessTime(gap.endTime)}</time>
            </li>)}</ul>}
        </DashboardSection>}
      </div>
    </div>
    {canOrders && <div className="dashboard-columns">
      <DashboardSection title="Nepreuzete narudžbine" icon="/orders" actions={<Link to="/orders?status=CREATED">Sve primljene →</Link>}>
        {renderOrders(today.unclaimedOrders, 'Nema nepreuzetih narudžbina')}
      </DashboardSection>
      <DashboardSection title="Moje narudžbine" icon="/orders" description="Narudžbine koje obrađujete">
        {renderOrders(today.assignedOrders, 'Nema narudžbina u obradi')}
      </DashboardSection>
    </div>}
    <DashboardQuickActions />
  </main>
}
