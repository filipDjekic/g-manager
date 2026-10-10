import type { ReactNode } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, EmptyState, TableShell } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import type { DashboardTrends, DashboardWorkload } from '../types/dashboard.types'
import type { ReservationStatus } from '../types/reservation.types'
import { DashboardSection } from './DashboardComponents'
import { formatChartDate, formatDashboardDate, formatDashboardMoney } from './presentation'

const statusColors: Record<ReservationStatus, string> = {
  PENDING: 'var(--color-warning)', CONFIRMED: 'var(--color-info)', REJECTED: 'var(--color-danger)',
  CANCELLED: 'var(--color-text-muted)', COMPLETED: 'var(--color-success)',
}
const tooltipStyle = {
  background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)', color: 'var(--color-text)', boxShadow: 'var(--shadow-raised)', fontSize: '.8125rem',
}
const tooltipItemStyle = { color: 'var(--color-text)' }
const number = (value: number) => value.toLocaleString('sr-RS')

function ChartTable({ label, children }: { label: string; children: ReactNode }) {
  return <details className="dashboard-chart-table"><summary>Tabelarni pregled</summary>
    <TableShell label={label}>{children}</TableShell>
  </details>
}

export function DashboardTrendChart({ trends }: { trends: DashboardTrends }) {
  const hasData = trends.buckets.some((item) => item.completedOrders || item.reservations || item.completedRevenue)
  return <DashboardSection title="Dnevni poslovni trendovi" icon="/reports" className="dashboard-chart-card"
    description="Prihod od završenih narudžbina po datumu kreiranja i rezervacije po danu početka termina.">
    {!hasData ? <EmptyState title="Nema podataka u periodu." /> : <div className="dashboard-plot" aria-hidden="true">
      <ResponsiveContainer width="100%" height={300}><ComposedChart data={trends.buckets} accessibilityLayer={false}
        margin={{ top: 16, right: 0, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--color-border)" />
        <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="var(--color-text-muted)" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="revenue" stroke="var(--color-text-muted)" tickLine={false} axisLine={false} width={52}
          tick={{ fontSize: 11 }} tickFormatter={(value: number) => value.toLocaleString('sr-RS', { notation: 'compact' })} />
        <YAxis yAxisId="count" orientation="right" allowDecimals={false} stroke="var(--color-text-muted)" tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelFormatter={(label) => formatDashboardDate(String(label))}
          formatter={(value, name) => [name === 'Prihod završenih narudžbina (RSD)' ? formatDashboardMoney(Number(value)) : number(Number(value)), name]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '.75rem', paddingTop: '1rem' }} />
        <Area yAxisId="revenue" type="monotone" dataKey="completedRevenue" name="Prihod završenih narudžbina (RSD)"
          stroke="var(--color-secondary)" fill="var(--color-secondary-bg)" strokeWidth={2} isAnimationActive={false} />
        <Bar yAxisId="count" dataKey="completedOrders" name="Završene narudžbine" fill="var(--color-text-muted)"
          fillOpacity={.45} maxBarSize={20} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="count" type="monotone" dataKey="reservations" name="Rezervacije" stroke="var(--color-primary)"
          strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </ComposedChart></ResponsiveContainer>
    </div>}
    <ChartTable label="Tabelarni podaci dnevnih trendova"><table>
      <caption>Dnevni prihod, završene narudžbine i rezervacije</caption>
      <thead><tr><th scope="col">Datum</th><th scope="col">Prihod RSD</th><th scope="col">Narudžbine</th><th scope="col">Rezervacije</th></tr></thead>
      <tbody>{trends.buckets.map((item) => <tr key={item.date}><th scope="row">{formatChartDate(item.date)}</th>
        <td>{formatDashboardMoney(item.completedRevenue)}</td><td>{number(item.completedOrders)}</td><td>{number(item.reservations)}</td>
      </tr>)}</tbody>
    </table></ChartTable>
  </DashboardSection>
}

export function DashboardStatusChart({ trends }: { trends: DashboardTrends }) {
  const user = useAuthStore((state) => state.user)
  const statuses = Object.entries(trends.reservationsByStatus) as [ReservationStatus, number][]
  const segments = statuses.filter(([, count]) => count > 0)
  const total = statuses.reduce((sum, [, count]) => sum + count, 0)
  return <DashboardSection title="Status rezervacija" icon="/reservations" className="dashboard-chart-card"
    description="Termini čiji početak pripada izabranom periodu.">
    {!total ? <EmptyState title="Nema rezervacija u periodu." /> : <>
      <div className="dashboard-donut" aria-hidden="true">
        <ResponsiveContainer width="100%" height={230}><PieChart accessibilityLayer={false}>
          <Pie data={segments.map(([status, value]) => ({ name: reservationLabels[status], value }))} dataKey="value" nameKey="name"
            innerRadius={65} outerRadius={90} paddingAngle={2} stroke="var(--color-surface)" strokeWidth={3} isAnimationActive={false}>
            {segments.map(([status]) => <Cell key={status} fill={statusColors[status]} />)}
          </Pie><Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} formatter={(value) => number(Number(value))} />
        </PieChart></ResponsiveContainer>
        <div className="dashboard-donut-label"><strong>{number(total)}</strong><span>rezervacija</span></div>
      </div>
      <ul className="dashboard-status-legend">{statuses.map(([status, count]) => <li key={status}>
        <span className="dashboard-status-dot" style={{ background: statusColors[status] }} aria-hidden="true" />
        <span>{reservationLabels[status]}</span><strong>{number(count)}</strong>
      </li>)}</ul>
    </>}
    <ChartTable label="Tabelarni podaci statusa rezervacija"><table>
      <caption>Rezervacije po statusu</caption><thead><tr><th scope="col">Status</th><th scope="col">Broj</th><th scope="col">Detalji</th></tr></thead>
      <tbody>{statuses.map(([status, count]) => <tr key={status}>
        <th scope="row"><Badge tone={reservationTones[status]}>{reservationLabels[status]}</Badge></th><td>{number(count)}</td>
        <td>{hasCapability(user, 'RESERVATION_READ_ALL') && <Link to={`/reservations?status=${status}&from=${trends.from}&to=${trends.to}`}>Otvori rezervacije</Link>}</td>
      </tr>)}</tbody>
    </table></ChartTable>
  </DashboardSection>
}

export function DashboardWorkloadChart({ workload, threshold }: { workload: DashboardWorkload; threshold: number }) {
  const user = useAuthStore((state) => state.user)
  const configured = workload.employees.filter((item) => item.utilizationPercent !== null)
  return <DashboardSection title="Opterećenje zaposlenih" icon="/employees" className="dashboard-chart-card"
    description={<>{workload.capacityDefinition}. Prag upozorenja: {threshold}%.</>}>
    {!workload.employees.length ? <EmptyState title="Nema aktivnih zaposlenih za filter." /> : !configured.length ?
      <EmptyState title="Radni kapacitet nije konfigurisan" description="Iskorišćenost će se prikazati kada postoje podaci o kapacitetu." /> :
      <div className="dashboard-workload-plot" aria-hidden="true">
        <ResponsiveContainer width="100%" height={Math.max(240, configured.length * 42)}>
          <BarChart layout="vertical" data={configured} accessibilityLayer={false} margin={{ top: 10, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 5" stroke="var(--color-border)" />
            <XAxis type="number" domain={[0, (maximum: number) => Math.max(100, maximum)]} tickFormatter={(value) => `${value}%`}
              stroke="var(--color-text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="employeeName" width={110} stroke="var(--color-text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'var(--color-primary-bg)' }}
              formatter={(value) => [`${number(Number(value))}%`, 'Iskorišćenost']} />
            <ReferenceLine x={threshold} stroke="var(--color-warning)" strokeDasharray="4 4" />
            <Bar dataKey="utilizationPercent" name="Iskorišćenost" maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {configured.map((item) => <Cell key={item.employeeId}
                fill={item.utilizationPercent! >= threshold ? 'var(--color-warning)' : 'var(--color-primary)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>}
    <ChartTable label="Tabelarni podaci opterećenja"><table>
      <caption>Potvrđeni i završeni rezervisani minuti prema dostupnim poslovnim minutima</caption>
      <thead><tr><th scope="col">Zaposleni</th><th scope="col">Termini</th><th scope="col">Rezervisano</th><th scope="col">Kapacitet</th><th scope="col">Iskorišćenost</th></tr></thead>
      <tbody>{workload.employees.map((item) => <tr key={item.employeeId}
        className={item.utilizationPercent !== null && item.utilizationPercent >= threshold ? 'threshold-exceeded' : undefined}>
        <th scope="row">{hasCapability(user, 'RESERVATION_READ_ALL') ?
          <Link to={`/reservations?employeeId=${item.employeeId}&from=${workload.from}&to=${workload.to}`}>{item.employeeName}</Link> : item.employeeName}</th>
        <td>{number(item.reservationCount)}</td><td>{number(item.reservedMinutes)} min</td>
        <td>{item.capacityMinutes ? `${number(item.capacityMinutes)} min` : 'Nije konfigurisan'}</td>
        <td>{item.utilizationPercent === null ? 'N/D' : `${number(item.utilizationPercent)}%`}</td>
      </tr>)}</tbody>
    </table></ChartTable>
  </DashboardSection>
}
