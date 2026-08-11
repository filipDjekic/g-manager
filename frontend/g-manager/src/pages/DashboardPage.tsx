import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { dashboardApi } from '../api/dashboardApi'
import { orderApi } from '../api/orderApi'
import { reservationApi } from '../api/reservationApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, EmptyState, TableShell } from '../components/ui'
import { currentBusinessMonth } from '../dashboard/dateRange'
import type { DashboardAttention, DashboardToday, DashboardTrends, DashboardWidgetPreference, DashboardWorkload } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'
import type { OrderStatus } from '../types/order.types'
import { formatBusinessDateTime, formatBusinessTime } from '../reservations/dateTime'

const statusColors: Record<ReservationStatus, string> = {
  PENDING: '#fbbf24', CONFIRMED: '#60a5fa', REJECTED: '#fb7185', CANCELLED: '#94a3b8', COMPLETED: '#6ee7b7',
}
const defaults: DashboardWidgetPreference[] = [
  { widgetKey: 'trends', position: 0, visible: true, threshold: null },
  { widgetKey: 'statuses', position: 1, visible: true, threshold: null },
  { widgetKey: 'workload', position: 2, visible: true, threshold: 80 },
]
const widgetLabels: Record<string, string> = { trends: 'Trendovi', statuses: 'Statusi rezervacija', workload: 'Opterećenje zaposlenih' }

function Change({ value }: { value: number | null }) {
  if (value === null) return <small>Prethodni period nema osnovicu</small>
  return <small className={value < 0 ? 'metric-down' : 'metric-up'}>{value > 0 ? '+' : ''}{value.toLocaleString('sr-RS')}% prema prethodnom periodu</small>
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'DASHBOARD_SUMMARY')
  const initial = useMemo(() => currentBusinessMonth(), [])
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to)
  const [employeeId, setEmployeeId] = useState('')
  const [trends, setTrends] = useState<DashboardTrends | null>(null)
  const [workload, setWorkload] = useState<DashboardWorkload | null>(null)
  const [today, setToday] = useState<DashboardToday | null>(null)
  const [attention, setAttention] = useState<DashboardAttention | null>(null)
  const [preferences, setPreferences] = useState(defaults)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')

  useEffect(() => {
    const request = management
      ? Promise.all([dashboardApi.attention(), dashboardApi.trends(initial.from, initial.to), dashboardApi.workload(initial.from, initial.to), dashboardApi.preferences()])
        .then(([nextAttention, nextTrends, nextWorkload, stored]) => { setAttention(nextAttention); setTrends(nextTrends); setWorkload(nextWorkload); if (stored.length) setPreferences(stored) })
      : dashboardApi.today().then(setToday)
    void request.catch((cause) => setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.'))).finally(() => setLoading(false))
  }, [initial.from, initial.to, management])

  async function load(event: FormEvent) {
    event.preventDefault()
    if (from > to) { setError('Početni datum ne sme biti posle završnog.'); return }
    setLoading(true); setError('')
    try {
      const [nextTrends, nextWorkload] = await Promise.all([
        dashboardApi.trends(from, to), dashboardApi.workload(from, to, employeeId || undefined),
      ])
      setTrends(nextTrends); setWorkload(nextWorkload)
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
    try { setPreferences(await dashboardApi.savePreferences(preferences)) }
    catch (cause) { setError(apiErrorMessage(cause, 'Raspored widgeta nije moguće sačuvati.')) }
  }

  async function refreshToday() {
    try { setToday(await dashboardApi.today()); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Radni dan nije moguće osvežiti.')) }
  }

  async function changeAppointment(id: string, version: number, status: ReservationStatus) {
    try { await reservationApi.changeStatus({ id, version }, status); await refreshToday() }
    catch (cause) { setError(apiErrorMessage(cause, 'Termin nije moguće ažurirati.')) }
  }

  async function changeOrder(id: string, version: number, status: OrderStatus) {
    try { await orderApi.changeStatus({ id, version }, status); await refreshToday() }
    catch (cause) { setError(apiErrorMessage(cause, 'Narudžbinu nije moguće ažurirati.')) }
  }

  if (loading && !trends && !today) return <main className="workspace"><p className="empty-state">Učitavanje dashboarda…</p></main>
  if (!management) {
    const actionLabel: Partial<Record<ReservationStatus | OrderStatus, string>> = {
      CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
      IN_PROGRESS: 'Preuzmi', READY: 'Označi spremno',
    }
    return <main className="workspace"><div className="page-heading"><div><p className="eyebrow">Danas · {today?.timezone}</p><h1>Moj radni dan</h1></div>
      <Button variant="secondary" onClick={() => void refreshToday()}>Osveži</Button></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <section className="today-section"><h2>Današnji termini</h2>
        {!today?.appointments.length ? <EmptyState title="Danas nema termina" description="Radni dan je trenutno slobodan." />
          : <div className="today-timeline">{today.appointments.map((item) => <article className="panel today-item" key={item.id}>
            <time>{formatBusinessTime(item.startTime)}–{formatBusinessTime(item.endTime)}</time>
            <div><strong>{item.serviceName}</strong><p>{item.customerName}</p><small>{item.status}</small></div>
            <div className="card-actions">{item.allowedActions.map((action) => <Button key={action}
              variant={action === 'CANCELLED' || action === 'REJECTED' ? 'danger' : 'primary'}
              onClick={() => void changeAppointment(item.id, item.version, action)}>{actionLabel[action] ?? action}</Button>)}</div>
          </article>)}</div>}
      </section>
      <section className="today-section"><h2>Slobodni intervali</h2>
        {!today?.gaps.length ? <p className="empty-state">Nema slobodnih intervala u podešenom radnom vremenu.</p>
          : <ul className="gap-list">{today.gaps.map((gap) => <li key={gap.startTime}>{formatBusinessTime(gap.startTime)}–{formatBusinessTime(gap.endTime)}</li>)}</ul>}
      </section>
      <div className="today-columns"><section className="today-section"><h2>Nepreuzete narudžbine</h2>
        {!today?.unclaimedOrders.length ? <EmptyState title="Nema nepreuzetih narudžbina" /> : today.unclaimedOrders.map((order) =>
          <article className="panel today-order" key={order.id}><div><strong>{order.totalPrice.toFixed(2)} RSD</strong><small>{formatBusinessDateTime(order.createdAt)}</small></div>
            {order.allowedActions.map((action) => <Button key={action} onClick={() => void changeOrder(order.id, order.version, action)}>{actionLabel[action]}</Button>)}</article>)}</section>
        <section className="today-section"><h2>Moje narudžbine</h2>
          {!today?.assignedOrders.length ? <EmptyState title="Nema narudžbina u obradi" /> : today.assignedOrders.map((order) =>
            <article className="panel today-order" key={order.id}><div><strong>{order.totalPrice.toFixed(2)} RSD</strong><small>{order.status}</small></div>
              <div className="card-actions">{order.allowedActions.map((action) => <Button key={action}
                variant={action === 'CANCELLED' ? 'danger' : 'primary'} onClick={() => void changeOrder(order.id, order.version, action)}>{actionLabel[action]}</Button>)}</div></article>)}</section></div>
      <section className="today-section"><h2>Zahteva pažnju</h2>
        {!today?.attentionNotifications.length ? <p className="empty-state">Nema novih obaveštenja za danas.</p>
          : <ul className="attention-list">{today.attentionNotifications.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.body}</span></li>)}</ul>}
      </section></main>
  }

  const statuses = Object.entries(trends?.reservationsByStatus ?? {}) as [ReservationStatus, number][]
  const visible = new Set(preferences.filter((item) => item.visible).map((item) => item.widgetKey))
  const workloadThreshold = preferences.find((item) => item.widgetKey === 'workload')?.threshold ?? 80
  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Poslovni pregled · {trends?.timezone}</p><h1>Dashboard</h1></div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => void download('current')}>Izvezi prikaz</button>
        <button type="button" className="secondary-button" onClick={() => void download('raw')}>Izvezi raw CSV</button></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <section className="attention-overview" aria-labelledby="attention-title">
      <div><h2 id="attention-title">Zahteva pažnju</h2><p>Današnje operativne stavke · {attention?.timezone}. Prag opterećenja {attention?.workloadThresholdPercent}%.</p></div>
      <div className="attention-grid">{attention?.items.map((item) => <article className={`attention-card ${item.severity}`} key={item.key}>
        <div><span>{item.detail}</span><strong>{item.count}</strong></div>
        <Link to={item.url}>{item.label}</Link>
      </article>)}</div>
    </section>
    <form className="filter-bar dashboard-filters" onSubmit={load}>
      <label>Od<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Do<input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>Zaposleni<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Svi zaposleni</option>
        {workload?.employees.map((item) => <option key={item.employeeId} value={item.employeeId}>{item.employeeName}</option>)}</select></label>
      <button type="submit" disabled={loading}>{loading ? 'Učitavanje…' : 'Primeni'}</button>
    </form>
    <p className="period-note">Trenutni period {trends?.from}–{trends?.to}; prethodni period {trends?.previousFrom}–{trends?.previousTo}; dnevni grain, zona {trends?.timezone}.</p>
    <section className="metric-grid">
      <article className="metric-card"><span>Realizovani prihod</span><strong>{trends?.revenue.current.toLocaleString('sr-RS')} RSD</strong><Change value={trends?.revenue.percentChange ?? null} /></article>
      <article className="metric-card"><span>Završene narudžbine</span><strong>{trends?.completedOrders.current ?? 0}</strong><Change value={trends?.completedOrders.percentChange ?? null} /></article>
      <article className="metric-card"><span>Rezervacije</span><strong>{trends?.reservations.current ?? 0}</strong><Change value={trends?.reservations.percentChange ?? null} /></article>
    </section>

    <details className="panel widget-settings"><summary>Prilagodi dashboard</summary>{[...preferences].sort((a, b) => a.position - b.position).map((item, index) =>
      <div className="widget-setting" key={item.widgetKey}><label className="inline-toggle"><input type="checkbox" checked={item.visible}
        onChange={(event) => setPreferences((items) => items.map((value) => value.widgetKey === item.widgetKey ? { ...value, visible: event.target.checked } : value))} />{widgetLabels[item.widgetKey]}</label>
        {item.widgetKey === 'workload' && <label>Prag %<input type="number" min="0" max="100" value={item.threshold ?? ''}
          onChange={(event) => setPreferences((items) => items.map((value) => value.widgetKey === item.widgetKey ? { ...value, threshold: event.target.value ? Number(event.target.value) : null } : value))} /></label>}
        <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setPreferences((items) => items.map((value) => value.widgetKey === item.widgetKey ? { ...value, position: item.position - 1 } : value))}>Pomeri gore</button></div>)}
      <button type="button" onClick={() => void savePreferences()}>Sačuvaj raspored</button></details>

    <div className="dashboard-charts">
      {visible.has('trends') && <section className="panel chart-panel dashboard-wide"><h2>Dnevni poslovni trendovi</h2>
        <p>Prihod obuhvata samo završene narudžbine po datumu kreiranja; rezervacije su termini čiji početak pripada danu.</p>
        {!trends?.buckets.some((item) => item.completedOrders || item.reservations) ? <p className="empty-state">Nema podataka u periodu.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={300}><BarChart data={trends?.buckets}>
          <CartesianGrid strokeDasharray="3 3" stroke="#315247" /><XAxis dataKey="date" stroke="#a7c5ba" /><YAxis stroke="#a7c5ba" />
          <Tooltip /><Bar dataKey="completedOrders" name="Završene narudžbine" fill="#6ee7b7" />
          <Bar dataKey="reservations" name="Rezervacije" fill="#60a5fa" /></BarChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci dnevnih trendova"><table><caption>Dnevni prihod, završene narudžbine i rezervacije</caption><thead><tr><th>Datum</th><th>Prihod RSD</th><th>Narudžbine</th><th>Rezervacije</th></tr></thead>
          <tbody>{trends?.buckets.map((item) => <tr key={item.date}><th scope="row">{item.date}</th><td>{item.completedRevenue}</td><td>{item.completedOrders}</td><td>{item.reservations}</td></tr>)}</tbody></table></TableShell></section>}

      {visible.has('statuses') && <section className="panel chart-panel"><h2>Status rezervacija</h2><p>Broj termina prema trenutnom statusu, za početak termina u izabranom periodu.</p>
        {!statuses.some(([, count]) => count) ? <p className="empty-state">Nema rezervacija u periodu.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statuses.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" outerRadius={90}>{statuses.map(([name]) => <Cell key={name} fill={statusColors[name]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci statusa rezervacija"><table><caption>Rezervacije po statusu</caption><thead><tr><th>Status</th><th>Broj</th><th>Detalji</th></tr></thead><tbody>{statuses.map(([status, count]) =>
          <tr key={status}><th scope="row">{status}</th><td>{count}</td><td><Link to={`/reservations?status=${status}&from=${from}&to=${to}`}>Otvori {status} rezervacije</Link></td></tr>)}</tbody></table></TableShell></section>}

      {visible.has('workload') && <section className="panel chart-panel"><h2>Opterećenje zaposlenih</h2><p>{workload?.capacityDefinition}. Prag upozorenja: {workloadThreshold}%.</p>
        {!workload?.employees.length ? <p className="empty-state">Nema aktivnih zaposlenih za filter.</p> : <div aria-hidden="true" inert><ResponsiveContainer width="100%" height={260}><BarChart data={workload?.employees}><CartesianGrid strokeDasharray="3 3" stroke="#315247" /><XAxis dataKey="employeeName" stroke="#a7c5ba" /><YAxis domain={[0, 100]} stroke="#a7c5ba" /><Tooltip /><Bar dataKey="utilizationPercent" name="Iskorišćenost %" fill="#fbbf24" /></BarChart></ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci opterećenja"><table><caption>Potvrđeni i završeni rezervisani minuti prema dostupnim poslovnim minutima</caption><thead><tr><th>Zaposleni</th><th>Termini</th><th>Rezervisano</th><th>Kapacitet</th><th>Iskorišćenost</th></tr></thead><tbody>{workload?.employees.map((item) =>
          <tr key={item.employeeId} className={item.utilizationPercent !== null && item.utilizationPercent >= workloadThreshold ? 'threshold-exceeded' : undefined}><th scope="row"><Link to={`/reservations?employeeId=${item.employeeId}&from=${from}&to=${to}`}>{item.employeeName}</Link></th><td>{item.reservationCount}</td><td>{item.reservedMinutes} min</td><td>{item.capacityMinutes || 'Nije konfigurisan'}</td><td>{item.utilizationPercent === null ? 'N/D' : `${item.utilizationPercent}%`}</td></tr>)}</tbody></table></TableShell></section>}
    </div>
    <p className="period-note">Team, attendance, kašnjenje i prekovremeni rad nisu prikazani jer projekat nema pouzdan team/attendance izvor podataka.</p>
  </main>
}
