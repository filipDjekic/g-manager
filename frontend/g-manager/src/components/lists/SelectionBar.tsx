import type { ReactNode } from 'react'

export function SelectionBar({ count, children, summary }: { count: number; children: ReactNode; summary?: string }) {
  if (!count && !summary) return null
  return <div className="selection-bar" role="status">
    <strong>Izabrano: {count}</strong>{children}{summary && <span>{summary}</span>}
  </div>
}
