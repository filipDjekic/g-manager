const paths: Record<string, string> = {
  '/dashboard': 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  '/home': 'M3 11 12 3l9 8 M5 10v11h5v-7h4v7h5V10',
  '/gaming-sessions': 'M3 4h18v12H3z M8 21h8 M12 16v5 M8 8h8',
  '/stations': 'M3 4h18v12H3z M8 21h8 M12 16v5 M7 10h4 M9 8v4 M16 9h.01 M18 11h.01',
  '/resources': 'M3 3h18v18H3z M3 11h18 M11 3v18',
  '/reservations': 'M5 4h14v17H5z M8 2v4 M16 2v4 M8 10h8 M8 14h5',
  '/my-reservations': 'M5 4h14v17H5z M8 2v4 M16 2v4 M8 10h8 M8 14h5',
  '/calendar': 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18',
  '/waitlist': 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  '/customers': 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  '/employees': 'M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M3 21v-3a7 7 0 0 1 14 0v3 M18 4a3 3 0 0 1 0 6 M21 21v-4a5 5 0 0 0-3-4',
  '/orders': 'M4 3h16v18l-4-2-4 2-4-2-4 2z M8 8h8 M8 12h8',
  '/my-orders': 'M4 3h16v18l-4-2-4 2-4-2-4 2z M8 8h8 M8 12h8',
  '/catalog': 'M3 4h8v16H3z M14 4h7v16h-7z M6 8h2 M17 8h1',
  '/settings': 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  '/profile': 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  '/reports': 'M4 21V11 M10 21V3 M16 21V7 M22 21H2',
}

export function NavigationIcon({ to }: { to: string }) {
  return <svg className="navigation-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[to] ?? 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h4'} />
  </svg>
}
