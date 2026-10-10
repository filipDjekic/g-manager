import { Button } from '../components/ui'

export function readGamingPage(value: string): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page - 1 : 0
}

export function GamingBoardPagination({ page, pageSize, total, label, onChange }: {
  page: number; pageSize: number; total: number; label: string; onChange: (page: number) => void
}) {
  const pages = Math.ceil(total / pageSize)
  const first = total ? page * pageSize + 1 : 0
  const last = Math.min((page + 1) * pageSize, total)
  const visible = new Set([0, pages - 1])
  const start = page < 3 ? 0 : page > pages - 4 ? Math.max(0, pages - 5) : page - 1
  const end = page < 3 ? Math.min(pages - 1, 4) : page > pages - 4 ? pages - 1 : page + 1
  for (let index = start; index <= end; index++) visible.add(index)
  const numbers = [...visible].filter((index) => index >= 0 && index < pages).sort((a, b) => a - b)

  return <div className="ops-pagination">
    <span className="ops-result-count" aria-live="polite">Prikazano {first.toLocaleString('sr-RS')}–{last.toLocaleString('sr-RS')} od {total.toLocaleString('sr-RS')}</span>
    {pages > 1 && <nav aria-label={label}>
      <Button type="button" variant="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>Prethodna</Button>
      {numbers.map((index, position) => <span className="ops-page-item" key={index}>
        {position > 0 && index - numbers[position - 1] > 1 && <span className="ops-page-gap" aria-hidden="true">…</span>}
        <Button type="button" variant="secondary" aria-label={`Stranica ${index + 1}`}
          aria-current={page === index ? 'page' : undefined} onClick={() => onChange(index)}>{index + 1}</Button>
      </span>)}
      <Button type="button" variant="secondary" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Sledeća</Button>
    </nav>}
  </div>
}
