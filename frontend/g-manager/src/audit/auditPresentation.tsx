import { type AuditIconKind } from './auditPresentation.model'
import type { ReactNode } from 'react'


export function AuditIcon({ kind, className = '' }: { kind: AuditIconKind; className?: string }) {
  const paths: Record<AuditIconKind, ReactNode> = {
    shield: <><path d="M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    filters: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    reset: <><path d="M4 9a8 8 0 1 1-.3 5M4 4v5h5" /></>,
    file: <><path d="M14 3H6v18h12V7zM14 3v5h4M9 12h6M9 16h6" /></>,
    create: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 12h8M12 8v8" /></>,
    update: <><path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4M13 20h7" /></>,
    delete: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    deactivate: <><circle cx="12" cy="12" r="8" /><path d="m6 6 12 12" /></>,
    other: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    chevronLeft: <path d="m14 6-6 6 6 6" />,
    chevronRight: <path d="m10 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  }
  return <svg className={`gm-audit-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}
