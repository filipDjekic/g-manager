import { Button, Select } from '../components/ui'

export function OrdersPagination({ page, size, totalPages, totalElements, busy, onPage, onSize }: {
  page: number; size: number; totalPages: number; totalElements: number; busy: boolean
  onPage: (page: number) => void; onSize: (size: number) => void
}) {
  const pages = Math.max(totalPages, 1), start = Math.max(0, Math.min(page - 1, pages - 3))
  const numbers = [...new Set([0, ...Array.from({ length: Math.min(3, pages) }, (_, index) => start + index), pages - 1])].sort((a, b) => a - b)
  return <div className="gm-orders-pagination"><div className="gm-orders-pagination-summary">
    <span aria-live="polite">Prikazano {totalElements ? page * size + 1 : 0}–{Math.min((page + 1) * size, totalElements)} od {totalElements} narudžbina · Stranica {page + 1} od {pages}</span>
    <label>Po stranici<Select value={size} disabled={busy} onChange={event => onSize(Number(event.target.value))}>
      {[10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}</Select></label></div>
    <nav aria-label="Stranice narudžbina"><Button type="button" variant="secondary" disabled={busy || page === 0} onClick={() => onPage(page - 1)}>Prethodna</Button>
      {numbers.map((number, index) => <span key={number} className="gm-orders-page-number">
        {index > 0 && number - numbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button type="button" variant="secondary" aria-current={page === number ? 'page' : undefined} aria-label={`Stranica ${number + 1}`}
          disabled={busy} onClick={() => onPage(number)}>{number + 1}</Button></span>)}
      <Button type="button" variant="secondary" disabled={busy || page + 1 >= pages} onClick={() => onPage(page + 1)}>Sledeća</Button></nav>
  </div>
}
