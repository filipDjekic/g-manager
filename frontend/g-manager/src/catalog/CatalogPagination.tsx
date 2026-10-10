import { Button, Select } from '../components/ui'

export function CatalogPagination({ page, size, totalPages, totalElements, loading, onPageChange, onSizeChange }: {
  page: number; size: number; totalPages: number; totalElements: number; loading: boolean
  onPageChange: (page: number) => void; onSizeChange: (size: number) => void
}) {
  const pages = Math.max(1, totalPages), start = Math.max(0, Math.min(page - 1, pages - 3))
  const numbers = [...new Set([0, ...Array.from({ length: Math.min(3, pages) }, (_, index) => start + index), pages - 1])].sort((a, b) => a - b)
  return <div className="gm-catalog-pagination">
    <div className="gm-catalog-pagination-summary"><span aria-live="polite">{totalElements ? page * size + 1 : 0}–{Math.min((page + 1) * size, totalElements)} od {totalElements} stavki · Stranica {page + 1} od {pages}</span>
      <label>Po stranici<Select value={size} disabled={loading} onChange={event => onSizeChange(Number(event.target.value))}>
        {[9, 24, 48].map(value => <option value={value} key={value}>{value}</option>)}</Select></label></div>
    <nav aria-label="Stranice kataloga">
      <Button type="button" variant="secondary" disabled={loading || page === 0} onClick={() => onPageChange(page - 1)}>Prethodna</Button>
      {numbers.map((number, index) => <span key={number} className="gm-catalog-page-number">
        {index > 0 && number - numbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button type="button" variant="secondary" aria-current={page === number ? 'page' : undefined} aria-label={`Stranica ${number + 1}`}
          disabled={loading} onClick={() => onPageChange(number)}>{number + 1}</Button></span>)}
      <Button type="button" variant="secondary" disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>Sledeća</Button>
    </nav>
  </div>
}
