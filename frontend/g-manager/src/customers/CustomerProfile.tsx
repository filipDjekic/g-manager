import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination } from '../components/ui/Pagination'
import { GamingTimePanel } from '../gaming/GamingTimePanel'
import { GamingPaymentHistory } from '../gaming/GamingPaymentHistory'
import { Tabs } from '../components/ui/Tabs'
import { useQuery } from '@tanstack/react-query'
import { useId, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { waitlistApi } from '../api/waitlistApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Drawer, EmptyState, ErrorState, Skeleton, Alert, StatCard } from '../components/ui'
import { orderLabels, orderTones, reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { GamingVisitHistory } from '../gaming/GamingVisitHistory'
import { NavigationIcon } from '../layout/NavigationIcon'
import { queryKeys } from '../query/queryKeys'
import type { CustomerListItem } from '../types/customer.types'
import type { OrderStatus } from '../types/order.types'
import type { ReservationStatus } from '../types/reservation.types'
import { CustomerCrmPanel } from './CustomerCrmPanel'
import { CustomerAvatar } from './CustomerTable'
import { customerDate, customerMoney } from './CustomerTable.model'

type ProfileTab = 'overview' | 'reservations' | 'gaming' | 'orders' | 'crm' | 'time'

export function CustomerProfile({ customerId, open, onClose, onEdit, onDeactivate, onStart, startBusy, actionError, returnFocusRef }: {
  customerId: string; open: boolean; onClose: () => void
  onEdit: (customer: CustomerListItem) => void; onDeactivate: (customer: CustomerListItem) => void
  onStart: (customer: CustomerListItem) => void; startBusy: boolean; actionError?: string
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const user = useAuthStore(state => state.user)
  const canReadGaming = hasCapability(user, 'GAMING_SESSION_READ')
  const canReadReservations = hasCapability(user, 'RESERVATION_READ_ALL')
  const canManageCrm = hasCapability(user, 'CUSTOMER_CRM_MANAGE')
  const canEdit = hasCapability(user, 'CUSTOMER_UPDATE_LIMITED')
  const [tab, setTab] = useState<ProfileTab>('overview')
  const id = useId()
  const detail = useQuery({ queryKey: queryKeys.customerDetail(customerId), queryFn: () => customerApi.detail(customerId) })
  const visits = useQuery({ queryKey: ['gaming-visits', 'customer', customerId],
    queryFn: () => gamingSessionApi.customerVisits(customerId), enabled: canReadGaming })
  const queue = useQuery({ queryKey: ['waitlist', 'customer', customerId],
    queryFn: () => waitlistApi.operational({ customerId, page: 0, size: 5 }), enabled: canReadReservations })
  const reservations = usePagedQuery(['customers', customerId, 'reservations'], (page, size) => customerApi.reservations(customerId, page, size), 10, tab === 'reservations')
  const orders = usePagedQuery(['customers', customerId, 'orders'], (page, size) => customerApi.orders(customerId, page, size), 10, tab === 'orders')
  const customer = detail.data?.customer
  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'overview', label: 'Pregled' }, { key: 'reservations', label: 'Rezervacije' },
    ...(canReadGaming ? [{ key: 'gaming' as const, label: 'Gaming sesije' }] : []),
    ...(canReadGaming ? [{ key: 'time' as const, label: 'Plaćanje' }] : []),
    { key: 'orders', label: 'Narudžbine' }, ...(canManageCrm ? [{ key: 'crm' as const, label: 'CRM' }] : []),
  ]
  const activeTab = tabs.some(item => item.key === tab) ? tab : 'overview'
  return <Drawer size="wide" className="customers-profile-drawer" open={open} title="Profil klijenta"
    onClose={onClose} returnFocusRef={returnFocusRef}>
    {detail.isLoading ? <Skeleton lines={7} label="Učitavanje profila klijenta" /> : detail.error ?
      <ErrorState message={apiErrorMessage(detail.error, 'Profil klijenta nije moguće učitati.')}
        action={<Button variant="secondary" onClick={() => void detail.refetch()}>Pokušaj ponovo</Button>} /> : customer && detail.data &&
      <div className="customers-profile">
        <header className="customers-profile-hero"><CustomerAvatar name={customer.name} large />
          <div><h2>{customer.name}</h2><p>{customer.email}</p>
            <Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Aktivan nalog' : 'Neaktivan nalog'}</Badge>
          </div>
        </header>
        {actionError && <Alert tone="danger" role="alert">{actionError}</Alert>}
        <div className="customers-profile-tabs"><Tabs idPrefix={id} label="Podaci o klijentu" value={activeTab} onChange={value=>setTab(value as ProfileTab)} items={tabs.map(item=>({id:item.key,label:item.label}))}/></div>
        <div id={`${id}-panel-${activeTab}`} role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`} tabIndex={0} className="customers-profile-content">
          {activeTab === 'overview' && <>
            <section className="customers-profile-section">
              <div className="customers-section-heading"><h3>Osnovne informacije</h3>
                {canEdit && <Button type="button" variant="secondary" onClick={() => onEdit(customer)}>Izmeni</Button>}</div>
              <dl className="customers-info">
                <div><dt>Ime i prezime</dt><dd>{customer.name}</dd></div>
                <div><dt>Email</dt><dd>{customer.email}</dd></div>
                <div><dt>Status</dt><dd>{customer.active ? 'Aktivan' : 'Neaktivan'}</dd></div>
                <div><dt>Datum registracije</dt><dd>{customerDate(customer.registeredAt)}</dd></div>
                <div><dt>Poslednja aktivnost</dt><dd>{customer.lastActivityAt ? customerDate(customer.lastActivityAt) : 'Nema aktivnosti'}</dd></div>
              </dl>
              <small>Prema najkasnijem početku rezervacije ili datumu kreiranja narudžbine.</small>
            </section>
            <section className="customers-profile-section"><h3>Statistika klijenta</h3>
              <div className="ui-stat-grid customers-profile-kpis">
                <StatCard icon={<NavigationIcon to="/reservations" />} value={customer.reservationCount} label="Ukupno rezervacija" />
                <StatCard icon={<NavigationIcon to="/calendar" />} value={customer.completedAppointmentCount} label="Završeni termini" />
                <StatCard icon={<NavigationIcon to="/orders" />} value={customer.completedOrderCount} label="Završene narudžbine" />
                <StatCard icon={<NavigationIcon to="/reports" />} value={customerMoney.format(customer.completedOrderRevenue)} label="Prihod završenih narudžbina" />
              </div>
            </section>
            {hasCapability(user, 'GAMING_SESSION_START') && <div className="customers-gaming-action">
              <NavigationIcon to="/gaming-sessions" /><div><h3>Gaming sesija</h3><p>Pokrenite sesiju na dostupnoj stanici.</p></div>
              <Button variant="primary" type="button" loading={startBusy} disabled={!customer.active || canReadGaming &&
                (visits.isFetching || !!visits.error || !visits.data || visits.data.some(visit => visit.status === 'ACTIVE'))}
                onClick={() => onStart(customer)}>Dodeli računar</Button>
              {!customer.active && <small>Pokretanje je dostupno samo aktivnim klijentima.</small>}
              {visits.data?.some(visit => visit.status === 'ACTIVE') && <small>Klijent već ima aktivnu gaming sesiju.</small>}
              {visits.error && <Button type="button" variant="secondary" onClick={() => void visits.refetch()}>Ponovi proveru gaming sesija</Button>}
            </div>}
          </>}
          {activeTab === 'time' && <><GamingTimePanel customerId={customerId} /><GamingPaymentHistory customerId={customerId} /></>}
          {activeTab === 'reservations' && <section className="customers-profile-section">
            <h3>Istorija rezervacija</h3>
            {reservations.isLoading && <Skeleton lines={3} />}
            {reservations.error && <ErrorState message="Istorija nije dostupna." action={<Button onClick={() => void reservations.refetch()}>Osveži</Button>} />}
            {reservations.data?.content.length ? <ul className="customers-history">{reservations.data!.content.map(item => {
              const status = item.status as ReservationStatus
              return <li key={item.id}><NavigationIcon to="/reservations" /><div><strong>{item.serviceName}</strong>
                <span>{customerDate(item.startTime)} - {customerDate(item.endTime)}</span></div>
                <Badge tone={reservationTones[status] ?? 'neutral'}>{reservationLabels[status] ?? 'Nepoznat status'}</Badge></li>
            })}</ul> : reservations.isSuccess ? <EmptyState title="Nema istorije rezervacija" description="Rezervacije klijenta će se pojaviti ovde." /> : null}
            {reservations.data && <Pagination label="Stranice rezervacija klijenta" page={reservations.page} onPageChange={reservations.setPage} totalPages={reservations.data.totalPages} totalElements={reservations.data.totalElements} pageSize={10} loading={reservations.isFetching} />}
            {canReadReservations && <Link className="customers-history-link" to={`/reservations?customerId=${customerId}`}>Otvori pregled rezervacija →</Link>}
            {canReadReservations && <section className="customers-waitlist"><h3>Lista čekanja</h3>
              {queue.isLoading ? <Skeleton lines={2} label="Učitavanje liste čekanja" /> : queue.error ?
                <ErrorState message={apiErrorMessage(queue.error, 'Lista čekanja nije dostupna.')}
                  action={<Button variant="secondary" onClick={() => void queue.refetch()}>Pokušaj ponovo</Button>} /> : !queue.data?.content.length ?
                  <p>Nema aktivnih prijava na listi čekanja.</p> : <ul className="customers-history">
                    {queue.data.content.map(entry => <li key={entry.id}><div><strong>{entry.serviceName}</strong>
                      <span>{customerDate(entry.desiredStart)}</span></div><Badge tone={entry.status === 'OFFERED' ? 'success' : 'warning'}>
                        {entry.status === 'OFFERED' ? 'Ponuda poslata' : 'Čeka termin'}</Badge></li>)}
                  </ul>}
              <Link className="customers-history-link" to={`/waitlist?customerId=${customerId}`}>
                Sve prijave{queue.data ? ` · ${queue.data.totalElements}` : ''} →</Link>
            </section>}
          </section>}
          {activeTab === 'gaming' && canReadGaming && <section className="customers-profile-section"><h3>Gaming sesije</h3>
            <GamingVisitHistory customerId={customerId} />
          </section>}
          {activeTab === 'orders' && <section className="customers-profile-section"><h3>Istorija narudžbina</h3>
            {orders.isLoading && <Skeleton lines={3} />}
            {orders.error && <ErrorState message="Istorija nije dostupna." action={<Button onClick={() => void orders.refetch()}>Osveži</Button>} />}
            {orders.data?.content.length ? <ul className="customers-history">{orders.data!.content.map(item => {
              const status = item.status as OrderStatus
              return <li key={item.id}><NavigationIcon to="/orders" /><div><strong>{customerMoney.format(item.totalPrice)}</strong>
                <span>{customerDate(item.createdAt)}</span></div><Badge tone={orderTones[status] ?? 'neutral'}>
                  {orderLabels[status] ?? 'Nepoznat status'}</Badge></li>
            })}</ul> : orders.isSuccess ? <EmptyState title="Nema istorije narudžbina" description="Narudžbine klijenta će se pojaviti ovde." /> : null}
            {orders.data && <Pagination label="Stranice narudzbina klijenta" page={orders.page} onPageChange={orders.setPage} totalPages={orders.data.totalPages} totalElements={orders.data.totalElements} pageSize={10} loading={orders.isFetching} />}
            {hasCapability(user, 'ORDER_READ_ALL') && <Link className="customers-history-link" to={`/orders?customerId=${customerId}`}>Otvori pregled narudžbina →</Link>}

          </section>}
          {activeTab === 'crm' && canManageCrm && <CustomerCrmPanel customerId={customerId} />}
        </div>
        {(canEdit || customer.active && hasCapability(user, 'CUSTOMER_DEACTIVATE')) && <footer className="customers-profile-actions">
          {canEdit && <Button type="button" variant="secondary" onClick={() => onEdit(customer)}>Izmeni podatke</Button>}
          {customer.active && hasCapability(user, 'CUSTOMER_DEACTIVATE') &&
            <Button type="button" variant="danger" onClick={() => onDeactivate(customer)}>Deaktiviraj klijenta</Button>}
        </footer>}
      </div>}
  </Drawer>
}
