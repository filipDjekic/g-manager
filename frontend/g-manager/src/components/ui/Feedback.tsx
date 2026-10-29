import { type HTMLAttributes, type ReactNode } from 'react'

export function Alert({ children, tone = 'info', className = '', ...props }: {
  children: ReactNode; tone?: Exclude<StatusTone, 'accent' | 'neutral'>
} & HTMLAttributes<HTMLDivElement>) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} {...props} className={`ui-alert ui-alert--${tone} ${className}`}>{children}</div>
}

export type StatusTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger'
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}

export function Skeleton({ lines = 3, label = 'Učitavanje' }: { lines?: number; label?: string }) {
  return <div className="ui-skeleton" role="status" aria-label={label}>
    {Array.from({ length: lines }, (_, index) => <span key={index} />)}
  </div>
}

export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: ReactNode
}) {
  return <div className="ui-empty"><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ title = 'Došlo je do greške', message, action }: {
  title?: string; message: string; action?: ReactNode
}) {
  return <div className="ui-error" role="alert"><h2>{title}</h2><p>{message}</p>{action}</div>
}

