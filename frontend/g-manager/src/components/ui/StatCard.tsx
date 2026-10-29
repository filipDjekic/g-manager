import { type HTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton, type StatusTone } from './Feedback'

export function StatCard({ label, value, icon, description, tone = 'info', loading = false, children, onClick, to, ...props }: {
  label: ReactNode; value: ReactNode; icon?: ReactNode; description?: ReactNode; tone?: string
  loading?: boolean; children?: ReactNode; onClick?: () => void; to?: string
} & Omit<HTMLAttributes<HTMLElement>, 'onClick'>) {
  const content = <><div className="ui-stat-heading"><span>{label}</span>{icon && <span className="ui-stat-icon">{icon}</span>}</div>
    {loading ? <Skeleton lines={1} /> : <div className="ui-stat-value">{value}</div>}
    {description && <div className="ui-stat-description">{description}</div>}{children}</>
  const tones: Record<string, StatusTone> = { blue:'info',pink:'accent',purple:'accent',green:'success',neutral:'neutral',info:'info',accent:'accent',success:'success',warning:'warning',danger:'danger' }
  const className = `ui-card ui-stat ui-stat--${tones[tone] ?? 'neutral'} ${props.className ?? ''}`
  if (to) return <Link {...props as HTMLAttributes<HTMLAnchorElement>} to={to} className={className}>{content}</Link>
  return onClick ? <button {...props as HTMLAttributes<HTMLButtonElement>} type="button" className={className} onClick={onClick}>{content}</button>
    : <article {...props} className={className}>{content}</article>
}

