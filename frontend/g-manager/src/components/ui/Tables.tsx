import { type HTMLAttributes, type ReactNode } from 'react'

export function TableShell({ label, children, className = '', ...props }: { label: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-table-shell ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>
}

