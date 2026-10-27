
import { useId } from 'react'




export function StationIcon({ kind = 'monitor' }: { kind?: 'monitor' | 'search' | 'refresh' | 'filter' | 'grid' | 'table' | 'settings' | 'apps' | 'shield' }) {
  const paths = {
    monitor: 'M3 4h18v12H3z M8 21h8 M12 16v5', search: 'M16 16l5 5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    refresh: 'M20 8a8 8 0 1 0 .6 7 M20 3v5h-5', filter: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4',
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', table: 'M3 4h18v16H3z M3 9h18 M3 14h18 M8 4v16',
    settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    apps: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z', shield: 'M12 2l9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6z M8 12l3 3 5-6',
  }
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}
export function StationIllustration() {
  const id = useId().replace(/:/g, '')
  return <div className="gm-stations-illustration" aria-hidden="true"><svg viewBox="0 0 320 140" fill="none">
    <defs><linearGradient id={`pc-${id}`} x1="54" y1="24" x2="270" y2="130" gradientUnits="userSpaceOnUse">
      <stop stopColor="var(--color-primary)" /><stop offset="1" stopColor="var(--color-secondary)" /></linearGradient></defs>
    <path d="M36 128h248" stroke="var(--color-border)" />
    <rect x="48" y="22" width="166" height="91" rx="7" fill="var(--color-bg)" stroke={`url(#pc-${id})`} strokeWidth="2" />
    <rect x="56" y="30" width="150" height="75" rx="3" fill="var(--color-surface-raised)" />
    <path d="M141 53h-23l-10 10v18l10 10h23V72h-15" stroke={`url(#pc-${id})`} strokeWidth="5" strokeLinejoin="round" />
    <path d="M125 114v10m-15 4h42" stroke="var(--color-text-muted)" strokeWidth="3" strokeLinecap="round" />
    <rect x="230" y="35" width="43" height="91" rx="5" fill="var(--color-bg)" stroke={`url(#pc-${id})`} strokeWidth="1.5" />
    <circle cx="251" cy="62" r="11" stroke={`url(#pc-${id})`} strokeWidth="2" /><circle cx="251" cy="94" r="11" stroke={`url(#pc-${id})`} strokeWidth="2" />
    <circle cx="251" cy="62" r="3" fill="var(--color-primary)" /><circle cx="251" cy="94" r="3" fill="var(--color-secondary)" />
    <path d="M246 119h10" stroke="var(--color-text-muted)" strokeLinecap="round" />
  </svg></div>
}
