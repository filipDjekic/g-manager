import { useId, type ReactNode } from 'react'
import { Card } from '../components/ui'
import './AuthLayout.css'

export function AuthLayout({ children }: { children: ReactNode }) {
  const gradientId = useId()

  return <main className="gm-auth-layout">
    <section className="gm-auth-intro" aria-label="G-Manager">
      <div className="gm-auth-brand">
        <svg className="gm-auth-logo" viewBox="0 0 168 168" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop offset="100%" stopColor="var(--color-secondary)" />
            </linearGradient>
          </defs>
          <path fill={`url(#${gradientId})`}
            d="M148 42 118 16H50L16 50v68l34 34h68l34-34V82H86v28h36v6l-16 16H62l-18-18V62l18-18h44l22 20Z" />
        </svg>
        <p className="gm-auth-wordmark">G-MANAGER</p>
        <span className="gm-auth-brand-line" aria-hidden="true" />
        <p className="gm-auth-description">
          Gaming Control Center za upravljanje igraonicom, rezervacijama, sesijama i operativom.
        </p>
      </div>
    </section>
    <div className="gm-auth-panel">
      <Card className="gm-auth-card">{children}</Card>
    </div>
  </main>
}
