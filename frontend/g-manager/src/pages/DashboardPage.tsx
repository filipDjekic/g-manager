import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { dashboardApi } from '../api/dashboardApi'
import { orderApi } from '../api/orderApi'
import { reservationApi } from '../api/reservationApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { Tabs } from '../components/ui/Tabs'
import { orderLabels, orderTones, reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { useToast } from '../components/ui/toastContext'
import { GamingOverview } from '../gaming/GamingOverview'
import { ActionDialog } from '../components/ui/ActionDialog'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { currentBusinessMonth } from '../dashboard/dateRange'
import type { DashboardAttention, DashboardToday, DashboardTrends, DashboardWidgetPreference, DashboardWorkload } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'
import type { OrderStatus } from '../types/order.types'
import { formatBusinessDateTime, formatBusinessTime, todayInBusinessZone } from '../reservations/dateTime'

const statusColors: Record<ReservationStatus, string> = {
  PENDING: 'var(--color-warning)', CONFIRMED: 'var(--color-info)', REJECTED: 'var(--color-danger)', CANCELLED: 'var(--color-text-muted)', COMPLETED: 'var(--color-success)',
}
const defaults: DashboardWidgetPreference[] = [
  { widgetKey: 'trends', position: 0, visible: true, threshold: null },
  { widgetKey: 'statuses', position: 1, visible: true, threshold: null },
  { widgetKey: 'workload', position: 2, visible: true, threshold: 80 },
]
const widgetLabels: Record<string, string> = { trends: 'Trendovi', statuses: 'Statusi rezervacija', workload: 'Opterećenje zaposlenih' }

function normalizePreferences(items: DashboardWidgetPreference[]) {
  const merged = defaults.map((fallback) => ({ ...fallback, ...items.find((item) => item.widgetKey === fallback.widgetKey) }))
  return merged.sort((a, b) => a.position - b.position || a.widgetKey.localeCompare(b.widgetKey))
    .map((item, position) => ({ ...item, position }))
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <small>Prethodni period nema osnovicu</small>
  return <small className={value < 0 ? 'metric-down' : 'metric-up'}>{value > 0 ? '+' : ''}{value.toLocaleString('sr-RS')}% prema prethodnom periodu</small>
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'DASHBOARD_SUMMARY')
  const [view, setView] = useState('operations')
  const [actionBusy, setActionBusy] = useState(false)
  const actionInFlight = useRef(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [savingPreferences, setSavingPreferences] = useState(false)
  const toast = useToast()
  const operationalDate = todayInBusinessZone()
  const dailyReservations = useQuery({ queryKey: ['dashboard', 'reservation-count', operationalDate],
    queryFn: () => reservationApi.list({ page: 0, size: 1, from: operationalDate, to: operationalDate }),
    enabled: management && hasCapability(user, 'RESERVATION_READ_ALL'), refetchInterval: 30000 })
  const initial = useMemo(() => currentBusinessMonth(), [])
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to)
  const [employeeId, setEmployeeId] = useState('')
  const [trends, setTrends] = useState<DashboardTrends | null>(null)
  const [workload, setWorkload] = useState<DashboardWorkload | null>(null)
  const [employeeOptions, setEmployeeOptions] = useState<DashboardWorkload['employees']>([])
  const [today, setToday] = useState<DashboardToday | null>(null)
  const [attention, setAttention] = useState<DashboardAttention | null>(null)
  const [preferences, setPreferences] = useState(defaults)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [reservationAction, setReservationAction] = useState<{
    id: string; version: number; status: ReservationStatus
  } | null>(null)

  useEffect(() => {
    const request = management
      ? Promise.all([dashboardApi.attention(), dashboardApi.trends(initial.from, initial.to), dashboardApi.workload(initial.from, initial.to), dashboardApi.preferences()])
        .then(([nextAttention, nextTrends, nextWorkload, stored]) => { setAttention(nextAttention); setTrends(nextTrends); setWorkload(nextWorkload); setEmployeeOptions(nextWorkload.employees); setPreferences(normalizePreferences(stored)) })
      : dashboardApi.today().then(setToday)
    void request.catch((cause) => setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.'))).finally(() => setLoading(false))
  }, [initial.from, initial.to, management])

  useEffect(() => {
    let active = true
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const request = management ? dashboardApi.attention().then((data) => { if (active) setAttention(data) })
        : dashboardApi.today().then((data) => { if (active) setToday(data) })
      void request.catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Operativne podatke nije moguće osvežiti.')) })
    }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [management])

  async function retryInitial() {
    setLoading(true); setError('')
    try {
      if (management) {
        const [a, t, w] = await Promise.all([dashboardApi.attention(), dashboardApi.trends(from, to), dashboardApi.workload(from, to)])
        setAttention(a); setTrends(t); setWorkload(w); setEmployeeOptions(w.employees)
      } else setToday(await dashboardApi.today())
    } catch (cause) { setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.')) }
    finally { setLoading(false) }
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (from > to) { setError('Početni datum ne sme biti posle završnog.'); return }
    setLoading(true); setError('')
    try {
      const [nextTrends, nextWorkload] = await Promise.all([
        dashboardApi.trends(from, to), dashboardApi.workload(from, to, employeeId || undefined),
      ])
      setTrends(nextTrends); setWorkload(nextWorkload)
      if (!employeeId) setEmployeeOptions(nextWorkload.employees)
    } catch (cause) { setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.')) }
    finally { setLoading(false) }
  }

  async function download(view: 'current' | 'raw') {
    try {
      const blob = await dashboardApi.export(from, to, view, employeeId || undefined)
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `dashboard-${from}-${to}-${view}.csv`; anchor.click(); URL.revokeObjectURL(url)
    } catch (cause) { setError(apiErrorMessage(cause, 'CSV nije moguće preuzeti.')) }
  }

  async function savePreferences() {
    if (savingPreferences) return
    if (preferences.some((item) => item.threshold !== null && (!Number.isFinite(item.threshold) || item.threshold < 0 || item.threshold > 100))) {
      setError('Prag upozorenja mora biti između 0 i 100.'); return
    }
    setSavingPreferences(true)
    try { setPreferences(normalizePreferences(await dashboardApi.savePreferences(normalizePreferences(preferences)))); toast('Raspored je sačuvan.', 'success') }
    catch (cause) { setError(apiErrorMessage(cause, 'Raspored widgeta nije moguće sačuvati.')) }
    finally { setSavingPreferences(false) }
  }

  function moveWidget(key: string, direction: number) {
    setPreferences((items) => {
      const ordered = normalizePreferences(items), index = ordered.findIndex((item) => item.widgetKey === key), next = index + direction
      if (index < 0 || next < 0 || next >= ordered.length) return ordered
      ;[ordered[index], ordered[next]] = [ordered[next], ordered[index]]
      return ordered.map((item, position) => ({ ...item, position }))
    })
  }

  async function refreshToday() {
    try { setToday(await dashboardApi.today()); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Radni dan nije moguće osvežiti.')) }
  }

  async function changeAppointment(id: string, version: number, status: ReservationStatus, reason?: string) {
    if (actionInFlight.current) return
    actionInFlight.current = true; setActionBusy(true)
    try { await reservationApi.changeStatus({ id, version }, status, reason); setReservationAction(null); await refreshToday() }
    catch (cause) { setError(apiErrorMessage(cause, 'Termin nije moguće ažurirati.')); throw cause }
    finally { actionInFlight.current = false; setActionBusy(false) }
  }

  async function changeOrder(id: string, version: number, status: OrderStatus) {
    if (actionInFlight.current) return
    actionInFlight.current = true; setActionBusy(true)
    try { await orderApi.changeStatus({ id, version }, status); await refreshToday() }
    catch (cause) { setError(apiErrorMessage(cause, 'Narudžbinu nije moguće ažurirati.')); throw cause }
    finally { actionInFlight.current = false; setActionBusy(false) }
  }

  function orderAction(id: string, version: number, status: OrderStatus) {
    if (status === 'CANCELLED') confirm({ title: 'Otkaži narudžbinu',
      description: 'Narudžbina će dobiti status Otkazano.', variant: 'danger', confirmLabel: 'Otkaži narudžbinu',
      onConfirm: () => changeOrder(id, version, status) })
    else void changeOrder(id, version, status).catch(() => {})
  }

  if (loading && !trends && !today) return <main className="workspace"><Skeleton lines={6} label="Učitavanje dashboarda" /></main>
  if (!trends && !today && error) return <main className="workspace"><ErrorState message={error} action={<Button onClick={() => void retryInitial()}>Pokušaj ponovo</Button>} />{hasCapability(user,'GAMING_SESSION_READ')&&<GamingOverview />}</main>
  if (!management) {
    const actionLabel: Partial<Record<ReservationStatus | OrderStatus, string>> = {
      CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
      IN_PROGRESS: 'Preuzmi', READY: 'Označi spremno',
    }
    return <main className="workspace">{confirmationDialog}<div className="page-heading"><div><p className="eyebrow">Danas · {today?.timezone}</p><h1>Moj radni dan</h1></div>
      <Button variant="secondary" onClick={() => void refreshToday()}>Osveži</Button></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {hasCapability(user,'GAMING_SESSION_READ')&&<GamingOverview />}
      <section className="today-section"><h2>Današnji termini</h2>
        {!today?.appointments.length ? <EmptyState title="Danas nema termina" description="Radni dan je trenutno slobodan." />
          : <div className="today-timeline">{today.appointments.map((item) => <article className="panel today-item" key={item.id}>
            <time>{formatBusinessTime(item.startTime)}–{formatBusinessTime(item.endTime)}</time>
            <div><strong>{item.serviceName}</strong><p>{item.customerName}</p><Badge tone={reservationTones[item.status]}>{reservationLabels[item.status]}</Badge></div>
            <div className="card-actions">{item.allowedActions.map((action) => <Button key={action}
              variant={action === 'CANCELLED' || action === 'REJECTED' ? 'danger' : 'primary'}
              onClick={() => action === 'CANCELLED' || action === 'REJECTED'
                ? setReservationAction({ id: item.id, version: item.version, status: action })
                : void changeAppointment(item.id, item.version, action).catch(() => {})} disabled={actionBusy}>{actionLabel[action] ?? action}</Button>)}</div>
          </article>)}</div>}
      </section>
      <section className="today-section"><h2>Slobodni intervali</h2>
        {!today?.gaps.length ? <p className="empty-state">Nema slobodnih intervala u podešenom radnom vremenu.</p>
          : <ul className="gap-list">{today.gaps.map((gap) => <li key={gap.startTime}>{formatBusinessTime(gap.startTime)}–{formatBusinessTime(gap.endTime)}</li>)}</ul>}
      </section>
      <div className="today-columns"><section className="today-section"><h2>Nepreuzete narudžbine</h2>
        {!today?.unclaimedOrders.length ? <EmptyState title="Nema nepreuzetih narudžbina" /> : today.unclaimedOrders.map((order) =>
          <article className="panel today-order" key={order.id}><div><strong>{order.totalPrice.toFixed(2)} RSD</strong><small>{formatBusinessDateTime(order.createdAt)}</small></div>
            {order.allowedActions.map((action) => <Button key={action} disabled={actionBusy} onClick={() => orderAction(order.id, order.version, action)}>{actionLabel[action]}</Button>)}</article>)}</section>
        <section className="today-section"><h2>Moje narudžbine</h2>
          {!today?.assignedOrders.length ? <EmptyState title="Nema narudžbina u obradi" /> : today.assignedOrders.map((order) =>
            <article className="panel today-order" key={order.id}><div><strong>{order.totalPrice.toFixed(2)} RSD</strong><Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge></div>
              <div className="card-actions">{order.allowedActions.map((action) => <Button key={action}
                variant={action === 'CANCELLED' ? 'danger' : 'primary'} disabled={actionBusy} onClick={() => orderAction(order.id, order.version, action)}>{actionLabel[action]}</Button>)}</div></article>)}</section></div>
      <section className="today-section"><h2>Zahteva pažnju</h2>
        {!today?.attentionNotifications.length ? <p className="empty-state">Nema novih obaveštenja za danas.</p>
          : <ul className="attention-list">{today.attentionNotifications.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.body}</span></li>)}</ul>}
      </section>
      <ActionDialog open={Boolean(reservationAction)}
        title={`${reservationAction ? actionLabel[reservationAction.status] : ''} termin`}
        description="Promena će odmah biti sačuvana i evidentirana."
        confirmLabel={reservationAction ? actionLabel[reservationAction.status] ?? 'Potvrdi' : 'Potvrdi'}
        reasonLabel="Razlog" reasonRequired danger loading={actionBusy} onClose={() => setReservationAction(null)}
        onConfirm={async (reason) => { if (reservationAction && reason) await changeAppointment(
          reservationAction.id, reservationAction.version, reservationAction.status, reason) }} />
    </main>
  }

  const statuses = Object.entries(trends?.reservationsByStatus ?? {}) as [ReservationStatus, number][]
  const workloadThreshold = preferences.find((item) => item.widgetKey === 'workload')?.threshold ?? 80
  const widgets: Record<string, ReactNode> = {
    trends: <section className="panel chart-panel dashboard-wide"><h2>Dnevni poslovni trendovi</h2>
        <p>Prihod obuhvata samo završene narudžbine po datumu kreiranja; rezervacije su termini čiji početak pripada danu.</p>
        {!trends?.buckets.some((item) => item.completedOrders || item.reservations) ? <p className="empty-state">Nema podataka u periodu.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={300}><BarChart data={trends?.buckets}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="date" stroke="var(--color-text-muted)" /><YAxis stroke="var(--color-text-muted)" />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} /><Bar dataKey="completedOrders" name="Završene narudžbine" fill="var(--color-primary)" />
          <Bar dataKey="reservations" name="Rezervacije" fill="var(--color-secondary)" /></BarChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci dnevnih trendova"><table><caption>Dnevni prihod, završene narudžbine i rezervacije</caption><thead><tr><th>Datum</th><th>Prihod RSD</th><th>Narudžbine</th><th>Rezervacije</th></tr></thead>
          <tbody>{trends?.buckets.map((item) => <tr key={item.date}><th scope="row">{item.date}</th><td>{item.completedRevenue}</td><td>{item.completedOrders}</td><td>{item.reservations}</td></tr>)}</tbody></table></TableShell></section>,
    statuses: <section className="panel chart-panel"><h2>Status rezervacija</h2><p>Broj termina prema trenutnom statusu, za početak termina u izabranom periodu.</p>
        {!statuses.some(([, count]) => count) ? <p className="empty-state">Nema rezervacija u periodu.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statuses.map(([name, value]) => ({ name: reservationLabels[name], value }))} dataKey="value" nameKey="name" outerRadius={90}>{statuses.map(([name]) => <Cell key={name} fill={statusColors[name]} />)}</Pie><Tooltip contentStyle={{ background: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} /></PieChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci statusa rezervacija"><table><caption>Rezervacije po statusu</caption><thead><tr><th>Status</th><th>Broj</th><th>Detalji</th></tr></thead><tbody>{statuses.map(([status, count]) =>
          <tr key={status}><th scope="row"><Badge tone={reservationTones[status]}>{reservationLabels[status]}</Badge></th><td>{count}</td><td>{hasCapability(user,'RESERVATION_READ_ALL') && <Link to={`/reservations?status=${status}&from=${from}&to=${to}`}>Otvori rezervacije</Link>}</td></tr>)}</tbody></table></TableShell></section>,
    workload: <section className="panel chart-panel"><h2>Opterećenje zaposlenih</h2><p>{workload?.capacityDefinition}. Prag upozorenja: {workloadThreshold}%.</p>
        {!workload?.employees.length ? <p className="empty-state">Nema aktivnih zaposlenih za filter.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={260}><BarChart data={workload?.employees}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="employeeName" stroke="var(--color-text-muted)" /><YAxis domain={[0, 100]} stroke="var(--color-text-muted)" /><Tooltip contentStyle={{ background: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} /><Bar dataKey="utilizationPercent" name="Iskorišćenost %" fill="var(--color-warning)" /></BarChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci opterećenja"><table><caption>Potvrđeni i završeni rezervisani minuti prema dostupnim poslovnim minutima</caption><thead><tr><th>Zaposleni</th><th>Termini</th><th>Rezervisano</th><th>Kapacitet</th><th>Iskorišćenost</th></tr></thead><tbody>{workload?.employees.map((item) =>
          <tr key={item.employeeId} className={item.utilizationPercent !== null && item.utilizationPercent >= workloadThreshold ? 'threshold-exceeded' : undefined}><th scope="row">{hasCapability(user,'RESERVATION_READ_ALL') ? <Link to={`/reservations?employeeId=${item.employeeId}&from=${from}&to=${to}`}>{item.employeeName}</Link> : item.employeeName}</th><td>{item.reservationCount}</td><td>{item.reservedMinutes} min</td><td>{item.capacityMinutes || 'Nije konfigurisan'}</td><td>{item.utilizationPercent === null ? 'N/D' : `${item.utilizationPercent}%`}</td></tr>)}</tbody></table></TableShell></section>,
  }
  const operationalItems = (attention?.items ?? []).filter((item) =>
    item.url.startsWith('/orders') ? hasCapability(user, 'ORDER_READ_ALL') : hasCapability(user, 'RESERVATION_READ_ALL'))
  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Poslovni pregled · {trends?.timezone}</p><h1>Dashboard</h1></div>
      <Button variant="secondary" loading={loading} onClick={() => void retryInitial()}>Osveži pregled</Button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <Tabs idPrefix="dashboard" label="Sadržaj dashboarda" value={view} onChange={setView}
      items={[{ id: 'operations', label: 'Operativni pregled' }, { id: 'analytics', label: 'Analitika' }]} />
    <div role="tabpanel" id="dashboard-panel-operations" aria-labelledby="dashboard-tab-operations" hidden={view !== 'operations'}>
      <section className="dashboard-quick-actions" aria-label="Brze akcije">
        {hasCapability(user,'RESERVATION_READ_ALL') && <><Link className="button-link" to="/reservations?create=true">Nova rezervacija</Link><Link to="/calendar">Kalendar →</Link></>}
        {hasCapability(user,'GAMING_SESSION_READ') && <Link to="/gaming-sessions">Gaming operativa →</Link>}
        {hasCapability(user,'ORDER_READ_ALL') && <Link to="/orders">Narudžbine →</Link>}
        {hasCapability(user,'CUSTOMER_READ') && <Link to="/customers">Klijenti →</Link>}
      </section>
      <section className="metric-grid dashboard-operational-metrics" aria-label="Poslovanje i današnja operativa">
        <article className="metric-card"><span>Realizovani prihod u periodu</span><strong>{trends?.revenue.current.toLocaleString('sr-RS')} RSD</strong><small>{trends?.from} – {trends?.to} · završene narudžbine</small></article>
        {hasCapability(user,'RESERVATION_READ_ALL') && <article className="metric-card"><span>Današnje rezervacije</span><strong>{dailyReservations.data?.totalElements ?? '—'}</strong><small>{operationalDate}{dailyReservations.error ? ' · pregled nije dostupan' : ' · svi statusi'}</small><Link to={`/reservations?status=&from=${operationalDate}&to=${operationalDate}`}>Pregled termina →</Link></article>}
        {hasCapability(user,'ORDER_READ_ALL') && <article className="metric-card"><span>Nepreuzete narudžbine</span><strong>{attention?.items.find((item) => item.key === 'orders-unclaimed')?.count ?? '—'}</strong><small>Trenutno primljene, bez zaposlenog</small><Link to="/orders?status=CREATED">Otvori narudžbine →</Link></article>}
      </section>
    {hasCapability(user,'GAMING_SESSION_READ')&&<GamingOverview />}
    <section className="attention-overview" aria-labelledby="attention-title">
      <div><h2 id="attention-title">Zahteva pažnju</h2><p>Operativni pregled za {attention?.date} · {attention?.timezone}. Narudžbine obuhvataju sve aktivne stavke.</p></div>
      <div className="attention-grid">{operationalItems.filter((item) => item.count > 0).map((item) => <article className={`attention-card ${item.severity}`} key={item.key}>
        <div><span>{item.detail}</span><strong>{item.count}</strong></div>
        <Link to={item.url}>{item.label}</Link>
      </article>)}</div>
    </section>
    {!operationalItems.some((item) => item.count > 0) && <EmptyState title="Nema operativnih upozorenja" description="Pregledajte gaming stanje i današnje termine." />}
    </div>
    <div role="tabpanel" id="dashboard-panel-analytics" aria-labelledby="dashboard-tab-analytics" hidden={view !== 'analytics'}>
    <div className="section-heading analytics-heading"><h2>Poslovni rezultati</h2><div className="form-actions">
      <Button variant="secondary" onClick={() => void download('current')}>Izvezi prikaz</Button>
      <Button variant="secondary" onClick={() => void download('raw')}>Izvezi izvorne podatke</Button>
    </div></div>
    <form className="filter-bar dashboard-filters" onSubmit={load}>
      <label>Od<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Do<input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>Zaposleni<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Svi zaposleni</option>
        {employeeOptions.map((item) => <option key={item.employeeId} value={item.employeeId}>{item.employeeName}</option>)}</select></label>
      <button type="submit" disabled={loading}>{loading ? 'Učitavanje…' : 'Primeni'}</button>
    </form>
    <p className="period-note">Trenutni period {trends?.from}–{trends?.to}; prethodni period {trends?.previousFrom}–{trends?.previousTo}; dnevni pregled, zona {trends?.timezone}.</p>
    <section className="metric-grid">
      <article className="metric-card"><span>Realizovani prihod</span><strong>{trends?.revenue.current.toLocaleString('sr-RS')} RSD</strong><Change value={trends?.revenue.percentChange ?? null} /></article>
      <article className="metric-card"><span>Završene narudžbine</span><strong>{trends?.completedOrders.current ?? 0}</strong><Change value={trends?.completedOrders.percentChange ?? null} /></article>
      <article className="metric-card"><span>Rezervacije</span><strong>{trends?.reservations.current ?? 0}</strong><Change value={trends?.reservations.percentChange ?? null} /></article>
    </section>

    <details className="panel widget-settings"><summary>Prilagodi dashboard</summary>{normalizePreferences(preferences).map((item, index) =>
      <div className="widget-setting" key={item.widgetKey}><label className="inline-toggle"><input type="checkbox" checked={item.visible}
        onChange={(event) => setPreferences((items) => items.map((value) => value.widgetKey === item.widgetKey ? { ...value, visible: event.target.checked } : value))} />{widgetLabels[item.widgetKey]}</label>
        {item.widgetKey === 'workload' && <label>Prag %<input type="number" min="0" max="100" value={item.threshold ?? ''}
          onChange={(event) => setPreferences((items) => items.map((value) => value.widgetKey === item.widgetKey ? { ...value, threshold: event.target.value ? Number(event.target.value) : null } : value))} /></label>}
        <div className="form-actions"><Button variant="secondary" disabled={index === 0 || savingPreferences} onClick={() => moveWidget(item.widgetKey, -1)}>Gore</Button>
          <Button variant="secondary" disabled={index === preferences.length - 1 || savingPreferences} onClick={() => moveWidget(item.widgetKey, 1)}>Dole</Button></div></div>)}
      <Button loading={savingPreferences} onClick={() => void savePreferences()}>Sačuvaj raspored</Button></details>

    <div className="dashboard-charts">{view === 'analytics' && normalizePreferences(preferences).filter((item) => item.visible).map((item) =>
      <div key={item.widgetKey} className={`dashboard-widget${item.widgetKey === 'trends' ? ' dashboard-wide' : ''}`}>{widgets[item.widgetKey]}</div>)}
    </div>
    </div>
  </main>
}
