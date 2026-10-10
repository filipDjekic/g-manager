import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { dashboardApi } from '../api/dashboardApi'
import { orderApi } from '../api/orderApi'
import { reservationApi } from '../api/reservationApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toastContext'
import { GamingOverview } from '../gaming/GamingOverview'
import { ActionDialog } from '../components/ui/ActionDialog'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { currentBusinessMonth } from '../dashboard/dateRange'
import { DashboardHeader, DashboardMetricCard, DashboardQuickActions, DashboardSection } from '../dashboard/DashboardComponents'
import { DashboardStatusChart, DashboardTrendChart, DashboardWorkloadChart } from '../dashboard/DashboardAnalytics'
import { EmployeeDashboard } from '../dashboard/EmployeeDashboard'
import { dashboardActionLabels, formatAttentionDetail, formatDashboardDate, formatDashboardMoney } from '../dashboard/presentation'
import '../dashboard/dashboard.css'
import type { DashboardAttention, DashboardToday, DashboardTrends, DashboardWidgetPreference, DashboardWorkload } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'
import type { OrderStatus } from '../types/order.types'
import { todayInBusinessZone } from '../reservations/dateTime'
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
  return <small className={value < 0 ? 'metric-down' : value > 0 ? 'metric-up' : 'dashboard-change-neutral'}>{value > 0 ? '+' : ''}{value.toLocaleString('sr-RS')}% prema prethodnom periodu</small>
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'DASHBOARD_SUMMARY')
  const operational = hasCapability(user, 'DASHBOARD_OPERATIONAL')
  const adminPriority = user?.role === 'ADMIN'
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
    if (!management && !operational) { setLoading(false); return }
    setLoading(true); setError('')
    let active = true
    const request = management
      ? Promise.all([dashboardApi.attention(), dashboardApi.trends(initial.from, initial.to), dashboardApi.workload(initial.from, initial.to), dashboardApi.preferences()])
        .then(([nextAttention, nextTrends, nextWorkload, stored]) => { if (!active) return; setAttention(nextAttention); setTrends(nextTrends); setWorkload(nextWorkload); setEmployeeOptions(nextWorkload.employees); setPreferences(normalizePreferences(stored)) })
      : dashboardApi.today().then((data) => { if (active) setToday(data) })
    void request.catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [initial.from, initial.to, management, operational])

  useEffect(() => {
    if (!management && !operational) return
    let active = true
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const request = management ? dashboardApi.attention().then((data) => { if (active) setAttention(data) })
        : dashboardApi.today().then((data) => { if (active) setToday(data) })
      void request.catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Operativne podatke nije moguće osvežiti.')) })
    }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [management, operational])

  async function retryInitial() {
    setLoading(true); setError('')
    try {
      if (management) {
        const [a, t, w, stored] = await Promise.all([dashboardApi.attention(), dashboardApi.trends(from, to),
          dashboardApi.workload(from, to, employeeId || undefined), trends ? Promise.resolve(null) : dashboardApi.preferences()])
        setAttention(a); setTrends(t); setWorkload(w)
        if (!employeeId) setEmployeeOptions(w.employees)
        if (stored) setPreferences(normalizePreferences(stored))
        if (hasCapability(user, 'RESERVATION_READ_ALL')) void dailyReservations.refetch()
      } else if (operational) setToday(await dashboardApi.today())
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
    setLoading(true)
    try { setToday(await dashboardApi.today()); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Radni dan nije moguće osvežiti.')) }
    finally { setLoading(false) }
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

  const headerTitle = management ? 'Dashboard' : 'Moj radni dan'
  const headerEyebrow = management ? adminPriority ? 'Operations Dashboard' : 'Business & Gaming Control Center' : 'Dnevna operativa'
  const headerDescription = management
    ? adminPriority ? 'Stanje igraonice, rezervacije i narudžbine koje zahtevaju vašu pažnju.'
      : 'Poslovni rezultati i gaming operativa na jednom mestu.'
    : 'Termini, narudžbine i zadaci koji su danas pred vama.'
  const hasDashboardData = management ? Boolean(trends) : Boolean(today)

  if (!management && !operational) return <main className="workspace g-dashboard">
    <ErrorState title="Dashboard nije dostupan" message="Nemate dozvolu za ovaj pregled." />
  </main>

  if (loading && !hasDashboardData) return <main className="workspace g-dashboard" aria-busy="true">
    <DashboardHeader title={headerTitle} eyebrow={headerEyebrow} description={headerDescription} date={operationalDate}
      loading onRefresh={() => void retryInitial()} />
    <div className="dashboard-kpis">{Array.from({ length: 4 }, (_, index) =>
      <div className="ui-card" key={index}><Skeleton lines={3} label="Učitavanje metrike" /></div>)}</div>
    <div className="ui-card"><Skeleton lines={6} label="Učitavanje dashboarda" /></div>
  </main>

  if (!hasDashboardData) return <main className="workspace g-dashboard">
    <DashboardHeader title={headerTitle} eyebrow={headerEyebrow} description={headerDescription} date={operationalDate}
      onRefresh={() => void retryInitial()} />
    <ErrorState message={error || 'Pregled trenutno nije dostupan.'}
      action={<Button onClick={() => void retryInitial()}>Pokušaj ponovo</Button>} />
    {hasCapability(user, 'GAMING_SESSION_READ') && <div className="dashboard-gaming"><GamingOverview /></div>}
  </main>

  if (!management && today) return <EmployeeDashboard today={today} busy={actionBusy} refreshing={loading} error={error}
    onRefresh={() => void refreshToday()}
    onAppointmentAction={(item, action) => action === 'CANCELLED' || action === 'REJECTED'
      ? setReservationAction({ id: item.id, version: item.version, status: action })
      : void changeAppointment(item.id, item.version, action).catch(() => {})}
    onOrderAction={(order, action) => orderAction(order.id, order.version, action)}>
    {confirmationDialog}
    <ActionDialog open={Boolean(reservationAction)}
      title={`${reservationAction ? dashboardActionLabels[reservationAction.status] : ''} termin`}
      description="Promena će odmah biti sačuvana i evidentirana."
      confirmLabel={reservationAction ? dashboardActionLabels[reservationAction.status] ?? 'Potvrdi' : 'Potvrdi'}
      reasonLabel="Razlog" reasonRequired danger loading={actionBusy} onClose={() => setReservationAction(null)}
      onConfirm={async (reason) => { if (reservationAction && reason) await changeAppointment(
        reservationAction.id, reservationAction.version, reservationAction.status, reason) }} />
  </EmployeeDashboard>

  const operationalItems = (attention?.items ?? []).filter((item) =>
    item.url.startsWith('/orders') ? hasCapability(user, 'ORDER_READ_ALL') : hasCapability(user, 'RESERVATION_READ_ALL'))
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  const flaggedItems = operationalItems.filter((item) => item.count > 0)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  const workloadThreshold = preferences.find((item) => item.widgetKey === 'workload')?.threshold ?? 80
  const orderedPreferences = normalizePreferences(preferences)
  const visibleWidgets = orderedPreferences.filter((item) => item.visible)
  const widgets: Record<string, ReactNode> = {
    trends: trends && <DashboardTrendChart trends={trends} />,
    statuses: trends && <DashboardStatusChart trends={trends} />,
    workload: workload && <DashboardWorkloadChart workload={workload} threshold={workloadThreshold} />,
  }
  const businessMetrics = <>
    <DashboardMetricCard label="Realizovani prihod" icon="/reports" tone="accent"
      value={trends ? formatDashboardMoney(trends.revenue.current) : '—'}
      detail="Prihod od završenih narudžbina">
      <Change value={trends?.revenue.percentChange ?? null} />
    </DashboardMetricCard>
    <DashboardMetricCard label="Rezervacije" icon="/reservations" value={trends?.reservations.current ?? '—'}
      detail="Svi statusi u izabranom periodu"><Change value={trends?.reservations.percentChange ?? null} /></DashboardMetricCard>
    <DashboardMetricCard label="Završene narudžbine" icon="/orders" tone="success" value={trends?.completedOrders.current ?? '—'}
      detail="U izabranom periodu"><Change value={trends?.completedOrders.percentChange ?? null} /></DashboardMetricCard>
  </>
  const dailyCard = hasCapability(user, 'RESERVATION_READ_ALL') && <DashboardMetricCard
    label="Današnje rezervacije" icon="/calendar" value={dailyReservations.data?.totalElements ?? '—'}
    detail={dailyReservations.error ? 'Dnevni pregled nije osvežen' : 'Današnji termini · svi statusi'}>
    <Link to={`/reservations?status=&from=${operationalDate}&to=${operationalDate}`}>Pregled termina →</Link>
    {dailyReservations.error && <Button type="button" variant="secondary" loading={dailyReservations.isFetching}
      onClick={() => void dailyReservations.refetch()}>Pokušaj ponovo</Button>}
  </DashboardMetricCard>
  const unclaimedCard = hasCapability(user, 'ORDER_READ_ALL') && <DashboardMetricCard
    label="Nepreuzete narudžbine" icon="/orders" tone="warning"
    value={attention?.items.find((item) => item.key === 'orders-unclaimed')?.count ?? '—'}
    detail="Primljene narudžbine bez zaposlenog"><Link to="/orders?status=CREATED">Otvori narudžbine →</Link>
  </DashboardMetricCard>

  return <main className={`workspace g-dashboard ${adminPriority ? 'dashboard-admin' : 'dashboard-owner'}`} aria-busy={loading || undefined}>
    <DashboardHeader title="Dashboard" eyebrow={headerEyebrow} description={headerDescription}
      date={attention?.date ?? operationalDate} timezone={attention?.timezone ?? trends?.timezone}
      loading={loading} onRefresh={() => void retryInitial()} />
    {error && <p className="error-banner" role="alert">{error}</p>}
    <Tabs idPrefix="dashboard" label="Sadržaj dashboarda" value={view} onChange={setView}
      items={[{ id: 'operations', label: 'Operativni pregled' }, { id: 'analytics', label: 'Analitika' }]} />

    <div className="dashboard-tab-panel" role="tabpanel" id="dashboard-panel-operations"
      aria-labelledby="dashboard-tab-operations" hidden={view !== 'operations'}>
      {adminPriority ? <div className="dashboard-kpis dashboard-kpis--compact" aria-label="Današnja operativa">
        {dailyCard}
        {hasCapability(user, 'RESERVATION_READ_ALL') && <DashboardMetricCard label="Rezervacije na čekanju" icon="/waitlist" tone="warning"
          value={attention?.items.find((item) => item.key === 'pending-today')?.count ?? '—'} detail="Početak termina je danas">
          <Link to={`/reservations?status=PENDING&from=${attention?.date ?? operationalDate}&to=${attention?.date ?? operationalDate}`}>Pregled rezervacija →</Link>
        </DashboardMetricCard>}
        {unclaimedCard}
        {hasCapability(user, 'ORDER_READ_ALL') && <DashboardMetricCard label="Narudžbine u obradi" icon="/orders"
          value={attention?.items.find((item) => item.key === 'orders-in-progress')?.count ?? '—'} detail="Sve trenutno aktivne narudžbine">
          <Link to="/orders?status=IN_PROGRESS">Pregled narudžbina →</Link>
        </DashboardMetricCard>}
      </div> : <>
        <p className="dashboard-period-label">Izabrani period: {trends && `${formatDashboardDate(trends.from)} – ${formatDashboardDate(trends.to)}`}</p>
        <div className="dashboard-kpis dashboard-kpis--owner" aria-label="Poslovanje i današnja operativa">
          {businessMetrics}{dailyCard}{unclaimedCard}
        </div>
      </>}
      {hasCapability(user, 'GAMING_SESSION_READ') && <div className="dashboard-gaming"><GamingOverview /></div>}
      <DashboardSection title={adminPriority ? 'Zahteva pažnju · današnja operativa' : 'Zahteva pažnju'} icon="/notification-preferences"
        description={attention && `Pregled za ${formatDashboardDate(attention.date)} · ${attention.timezone}. Narudžbine obuhvataju sve aktivne stavke.`}>
        {!flaggedItems.length ? <EmptyState title="Nema operativnih upozorenja" description="Pregledajte gaming stanje i današnje termine." /> :
          <div className="dashboard-attention-grid">{flaggedItems.map((item) => <article key={item.key}
            className={`dashboard-attention dashboard-attention--${item.severity}`}>
            <div className="dashboard-attention-heading"><Badge tone={item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'}>
              {item.severity === 'critical' ? 'Prioritet' : item.severity === 'warning' ? 'Za proveru' : 'Operativa'}
            </Badge><strong>{item.count.toLocaleString('sr-RS')}</strong></div>
            <h3>{item.label}</h3><p>{formatAttentionDetail(item)}</p><Link to={item.url}>Otvori pregled →</Link>
          </article>)}</div>}
      </DashboardSection>
      <DashboardQuickActions />
      {adminPriority && <section className="dashboard-business-preview" aria-labelledby="dashboard-business-title">
        <div className="section-heading"><h2 id="dashboard-business-title">Poslovni pregled</h2>
          <span className="dashboard-period-label">{trends && `${formatDashboardDate(trends.from)} – ${formatDashboardDate(trends.to)}`}</span></div>
        <div className="dashboard-kpis dashboard-kpis--business">{businessMetrics}</div>
      </section>}
    </div>

    <div className="dashboard-tab-panel" role="tabpanel" id="dashboard-panel-analytics"
      aria-labelledby="dashboard-tab-analytics" hidden={view !== 'analytics'}>
      <div className="dashboard-analytics-toolbar">
        <div><h2>Poslovni rezultati</h2><p>Prihod od završenih narudžbina, rezervacije i opterećenje zaposlenih.</p></div>
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void download('current')}>Izvezi prikaz</Button>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void download('raw')}>Izvezi izvorne podatke</Button>
        </div>
      </div>
      <form className="dashboard-filter-panel" onSubmit={load}>
        <label>Od<Input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Do<Input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Zaposleni<Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Svi zaposleni</option>{employeeOptions.map((item) =>
            <option key={item.employeeId} value={item.employeeId}>{item.employeeName}</option>)}
        </Select></label>
        <Button type="submit" loading={loading}>Primeni</Button>
      </form>
      {trends && <p className="dashboard-period-label">
        Trenutni period: {formatDashboardDate(trends.from)} – {formatDashboardDate(trends.to)}.
        Prethodni: {formatDashboardDate(trends.previousFrom)} – {formatDashboardDate(trends.previousTo)} · {trends.timezone}.
      </p>}
      <div className="dashboard-kpis dashboard-kpis--business" aria-label="Poslovni rezultati u periodu">{businessMetrics}</div>

      <details className="ui-card dashboard-widget-settings"><summary>Prilagodi dashboard</summary>
        <fieldset disabled={savingPreferences}>{orderedPreferences.map((item, index) =>
          <div className="dashboard-widget-setting" key={item.widgetKey}>
            <label className="inline-toggle"><input type="checkbox" checked={item.visible}
              onChange={(event) => setPreferences((items) => items.map((value) =>
                value.widgetKey === item.widgetKey ? { ...value, visible: event.target.checked } : value))} />{widgetLabels[item.widgetKey]}</label>
            {item.widgetKey === 'workload' && <label className="dashboard-threshold">Prag %
              <Input type="number" min="0" max="100" value={item.threshold ?? ''}
                onChange={(event) => setPreferences((items) => items.map((value) =>
                  value.widgetKey === item.widgetKey ? { ...value, threshold: event.target.value ? Number(event.target.value) : null } : value))} />
            </label>}
            <div className="form-actions"><Button type="button" variant="secondary" disabled={index === 0}
              aria-label={`Pomeri ${widgetLabels[item.widgetKey]} gore`} onClick={() => moveWidget(item.widgetKey, -1)}>Gore</Button>
              <Button type="button" variant="secondary" disabled={index === preferences.length - 1}
                aria-label={`Pomeri ${widgetLabels[item.widgetKey]} dole`} onClick={() => moveWidget(item.widgetKey, 1)}>Dole</Button>
            </div>
          </div>)}</fieldset>
        <Button type="button" loading={savingPreferences} onClick={() => void savePreferences()}>Sačuvaj raspored</Button>
      </details>
      {!visibleWidgets.length && <EmptyState title="Svi widgeti su sakriveni" description="Otvorite „Prilagodi dashboard“ i izaberite preglede koje želite da vidite." />}
      <div className="dashboard-chart-grid">{view === 'analytics' && visibleWidgets.map((item) =>
        <div key={item.widgetKey} className={`dashboard-widget dashboard-widget--${item.widgetKey}`}>{widgets[item.widgetKey]}</div>)}
      </div>
    </div>
  </main>
}
