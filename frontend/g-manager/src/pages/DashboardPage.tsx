import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { apiErrorMessage } from '../api/client'
import { dashboardApi } from '../api/dashboardApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { TableShell } from '../components/ui'
import { currentBusinessMonth } from '../dashboard/dateRange'
import type { DashboardSummary, DashboardToday } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'

const statusColors: Record<ReservationStatus, string> = {
  PENDING: '#fbbf24',
  CONFIRMED: '#60a5fa',
  REJECTED: '#fb7185',
  CANCELLED: '#94a3b8',
  COMPLETED: '#6ee7b7',
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'DASHBOARD_SUMMARY')
  const initialRange = useMemo(() => currentBusinessMonth(), [])
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [today, setToday] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const request = management
      ? dashboardApi.summary(initialRange.from, initialRange.to).then(setSummary)
      : dashboardApi.today().then(setToday)
    void request.catch((cause) =>
      setError(apiErrorMessage(cause, 'Dashboard nije moguće učitati.')))
      .finally(() => setLoading(false))
  }, [initialRange.from, initialRange.to, management])

  async function loadSummary(event: FormEvent) {
    event.preventDefault()
    if (from > to) {
      setError('Početni datum ne sme biti posle završnog.')
      return
    }
    setLoading(true)
    setError('')
    try {
      setSummary(await dashboardApi.summary(from, to))
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Sažetak nije moguće učitati.'))
    } finally {
      setLoading(false)
    }
  }

  if (loading && !summary && !today) {
    return <main className="workspace"><p className="empty-state">Učitavanje dashboarda…</p></main>
  }

  if (!management) {
    const cards = [
      ['Zahtevi za termine', today?.pendingReservationsToMe ?? 0],
      ['Potvrđeni termini danas', today?.confirmedTodayCount ?? 0],
      ['Nepreuzete narudžbine', today?.unclaimedOrdersCount ?? 0],
      ['Moje narudžbine u obradi', today?.myInProgressOrdersCount ?? 0],
    ]
    return <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">Danas · Europe/Belgrade</p><h1>Operativni dashboard</h1></div></div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <section className="metric-grid">{cards.map(([label, value]) =>
        <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    </main>
  }

  const statusData = Object.entries(summary?.reservationsByStatus ?? {})
    .map(([name, value]) => ({ name, value }))
  const revenueData = [{ name: 'Završene narudžbine', value: summary?.totalRevenueCompleted ?? 0 }]
  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Poslovni pregled</p><h1>Dashboard</h1></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <form className="filter-bar" onSubmit={loadSummary}>
      <label>Od<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Do<input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" disabled={loading}>{loading ? 'Učitavanje…' : 'Primeni'}</button>
    </form>
    <section className="metric-grid">
      <article className="metric-card"><span>Prihod završenih narudžbina</span>
        <strong>{(summary?.totalRevenueCompleted ?? 0).toLocaleString('sr-RS', { minimumFractionDigits: 2 })} RSD</strong></article>
      <article className="metric-card"><span>Završene narudžbine</span>
        <strong>{summary?.completedOrdersCount ?? 0}</strong></article>
      <article className="metric-card"><span>Rezervacije u opsegu</span>
        <strong>{statusData.reduce((total, item) => total + item.value, 0)}</strong></article>
    </section>
    <div className="dashboard-charts">
      <section className="panel chart-panel"><h2>Rezervacije po statusu</h2>
        {!statusData.some((item) => item.value > 0) && <p className="empty-state">Nema rezervacija u opsegu.</p>}
        {statusData.some((item) => item.value > 0) && <div aria-hidden="true"><ResponsiveContainer width="100%" height={300}>
          <PieChart accessibilityLayer={false}><Pie rootTabIndex={-1} data={statusData} dataKey="value" nameKey="name" outerRadius={100} label>
            {statusData.map((item) => <Cell key={item.name}
              fill={statusColors[item.name as ReservationStatus]} />)}
          </Pie><Tooltip /></PieChart>
        </ResponsiveContainer></div>}
        <TableShell label="Tabelarni podaci grafikona rezervacija po statusu">
          <table><caption>Broj rezervacija grupisan po statusu za izabrani period</caption>
            <thead><tr><th scope="col">Status</th><th scope="col">Broj rezervacija</th></tr></thead>
            <tbody>{statusData.map((item) => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.value}</td></tr>)}</tbody>
          </table>
        </TableShell>
      </section>
      <section className="panel chart-panel"><h2>Realizovani prihod</h2>
        <div aria-hidden="true"><ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenueData} accessibilityLayer={false}><CartesianGrid strokeDasharray="3 3" stroke="#315247" />
            <XAxis dataKey="name" stroke="#a7c5ba" /><YAxis stroke="#a7c5ba" />
            <Tooltip /><Bar dataKey="value" fill="#6ee7b7" /></BarChart>
        </ResponsiveContainer></div>
        <TableShell label="Tabelarni podaci grafikona realizovanog prihoda">
          <table><caption>Realizovani prihod završenih narudžbina za izabrani period</caption>
            <thead><tr><th scope="col">Metrika</th><th scope="col">Iznos u RSD</th></tr></thead>
            <tbody>{revenueData.map((item) => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.value.toLocaleString('sr-RS')}</td></tr>)}</tbody>
          </table>
        </TableShell>
      </section>
    </div>
  </main>
}
