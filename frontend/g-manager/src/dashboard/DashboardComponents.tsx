import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, PageHeader, type StatusTone } from '../components/ui'
import { orderLabels, orderTones } from '../components/ui/statusPresentation'
import { NavigationIcon } from '../layout/NavigationIcon'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { Permission } from '../types/auth.types'
import type { DashboardTodayOrder } from '../types/dashboard.types'
import { formatDashboardDate, formatDashboardMoney } from './presentation'

export function DashboardHeader({ title, eyebrow, description, date, timezone, loading, onRefresh, children }: {
  title: string; eyebrow: string; description: string; date: string; timezone?: string
  loading?: boolean; onRefresh: () => void; children?: ReactNode
}) {
  return <div className="dashboard-header">
    <PageHeader eyebrow={eyebrow} title={title} actions={
      <Button type="button" variant="secondary" loading={loading} onClick={onRefresh}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1" />
        </svg>
        Osveži pregled
      </Button>} />
    <p className="dashboard-description">{description}</p>
    <div className="dashboard-meta">
      <time dateTime={date}>{formatDashboardDate(date)}</time>
      {timezone && <Badge tone="neutral">{timezone}</Badge>}
      {children}
    </div>
  </div>
}

export function DashboardMetricCard({ label, value, detail, icon, tone = 'info', children }: {
  label: string; value: ReactNode; detail?: ReactNode; icon: string; tone?: StatusTone; children?: ReactNode
}) {
  return <article className={`ui-card dashboard-metric dashboard-metric--${tone}`}>
    <div className="dashboard-metric-heading"><span>{label}</span>
      <span className="dashboard-metric-icon"><NavigationIcon to={icon} /></span>
    </div>
    <strong className="dashboard-metric-value">{typeof value === 'number' ? value.toLocaleString('sr-RS') : value}</strong>
    {detail && <div className="dashboard-metric-detail">{detail}</div>}
    {children}
  </article>
}

export function DashboardSection({ title, description, icon, actions, className = '', children }: {
  title: string; description?: ReactNode; icon?: string; actions?: ReactNode; className?: string; children: ReactNode
}) {
  const titleId = useId()
  return <section className={`ui-card dashboard-section ${className}`} aria-labelledby={titleId}>
    <header className="dashboard-section-heading">
      {icon && <span className="dashboard-section-icon"><NavigationIcon to={icon} /></span>}
      <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
      {actions && <div className="dashboard-section-actions">{actions}</div>}
    </header>
    <div className="dashboard-section-body">{children}</div>
  </section>
}

const shortcuts: Array<{ label: string; to: string; icon: string; capability: Permission }> = [
  { label: 'Nova rezervacija', to: '/reservations?create=true', icon: '/reservations', capability: 'RESERVATION_READ_ALL' },
  { label: 'Kalendar', to: '/calendar', icon: '/calendar', capability: 'RESERVATION_READ_ALL' },
  { label: 'Gaming operativa', to: '/gaming-sessions', icon: '/gaming-sessions', capability: 'GAMING_SESSION_READ' },
  { label: 'Narudžbine', to: '/orders', icon: '/orders', capability: 'ORDER_READ_ALL' },
  { label: 'Klijenti', to: '/customers', icon: '/customers', capability: 'CUSTOMER_READ' },
]

export function DashboardQuickActions() {
  const user = useAuthStore((state) => state.user)
  const allowed = shortcuts.filter((item) => hasCapability(user, item.capability))
  if (!allowed.length) return null
  return <nav className="dashboard-shortcuts" aria-label="Brze akcije">
    {allowed.map((item) => <Link key={item.to} to={item.to}>
      <NavigationIcon to={item.icon} /><span>{item.label}</span><span aria-hidden="true">↗</span>
    </Link>)}
  </nav>
}

export function DashboardOrderCard({ order, children }: {
  order: Pick<DashboardTodayOrder, 'status' | 'totalPrice' | 'createdAt'>; children?: ReactNode
}) {
  return <article className="dashboard-order">
    <div className="dashboard-order-heading"><strong>{formatDashboardMoney(order.totalPrice)}</strong>
      <Badge tone={orderTones[order.status]}>{orderLabels[order.status]}</Badge>
    </div>
    <time dateTime={order.createdAt}>{formatBusinessDateTime(order.createdAt)}</time>
    {children && <div className="dashboard-order-actions">{children}</div>}
  </article>
}
