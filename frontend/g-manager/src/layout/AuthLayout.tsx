import type { ReactNode } from 'react'
import { Card } from '../components/ui'
import { BrandLogo } from './BrandLogo'
import './AuthLayout.css'

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="gm-auth-layout">
    <section className="gm-auth-intro" aria-label="G-Manager">
      <div className="gm-auth-brand">
        <BrandLogo className="gm-auth-logo" />
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
