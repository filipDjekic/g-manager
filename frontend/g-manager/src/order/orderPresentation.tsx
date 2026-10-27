








export function OrderIcon({ kind = 'cart' }: { kind?: 'cart' | 'refresh' | 'search' | 'filter' | 'check' | 'clock' | 'cancel' }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'refresh' ? <><path d="M20 8a8 8 0 1 0 .6 7M20 3v5h-5" /></> : kind === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>
      : kind === 'filter' ? <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>
      : kind === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : kind === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
      : kind === 'cancel' ? <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>
      : <><path d="M3 3h2l3 12h10l3-8H6M8 15l-1 3h12" /><circle cx="9" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>}
  </svg>
}
