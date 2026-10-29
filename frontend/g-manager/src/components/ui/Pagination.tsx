import { useEffect } from 'react'
import { Button } from './Button'
import { Select } from './FormControls'

export function Pagination({ page, totalPages = 1, onPageChange, loading = false, numbered = false,
  totalElements, pageSize = 10, onPageSizeChange, pageSizes = [10, 20, 50, 100], label = 'Stranice rezultata', disabled = false }: {
  page: number; totalPages?: number; onPageChange: (page: number) => void; loading?: boolean
  numbered?: boolean; totalElements?: number; pageSize?: number; label?: string; disabled?: boolean
  onPageSizeChange?: (size: number) => void; pageSizes?: readonly number[]
}) {
  const pages = Math.max(1, Number.isFinite(totalPages) ? Math.floor(totalPages) : 1)
  const current = Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, pages - 1))
  const busy = loading || disabled
  useEffect(() => {
    if (!busy && current !== page) onPageChange(current)
  }, [busy, current, page, onPageChange])
  const start = Math.max(0, Math.min(current - 1, pages - 3))
  const visible = [...new Set([0, ...Array.from({ length: Math.min(3, pages) }, (_, index) => start + index), pages - 1])].sort((a, b) => a - b)
  return <div className="ui-pagination" aria-busy={loading || undefined}>
    <div className="ui-pagination-summary"><span aria-live="polite">{totalElements !== undefined && <>Prikazano {totalElements ? Math.min(current * pageSize + 1, totalElements) : 0}–{Math.min((current + 1) * pageSize, totalElements)} od {totalElements} rezultata · </>}Stranica {current + 1} od {pages}</span>
      {onPageSizeChange && <label>Po stranici<Select aria-label={"Po stranici"} value={pageSize} disabled={busy} onChange={event => onPageSizeChange(Number(event.target.value))}>
        {[...new Set([...pageSizes, pageSize])].sort((a, b) => a - b).map(size => <option key={size} value={size}>{size}</option>)}
      </Select></label>}
    </div>
    <nav className="ui-pagination-controls" aria-label={label}>
      <Button variant="secondary" disabled={busy || current === 0} onClick={() => onPageChange(current - 1)}>Prethodna</Button>
      {numbered && visible.map((number, index) => <span className="ui-pagination-page" key={number}>
        {index > 0 && number - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button variant="secondary" disabled={busy} aria-current={current === number ? 'page' : undefined}
          aria-label={`Stranica ${number + 1}`} onClick={() => onPageChange(number)}>{number + 1}</Button>
      </span>)}
      <Button variant="secondary" disabled={busy || current + 1 >= pages} onClick={() => onPageChange(current + 1)}>Sledeća</Button>
    </nav>
  </div>
}

