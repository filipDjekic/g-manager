import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auditApi } from '../api/auditApi'
import { apiErrorMessage } from '../api/client'
import type { PageResponse } from '../types/api.types'
import type { AuditEvent } from '../types/audit.types'

function localTime(value: string) {
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Belgrade',
  }).format(new Date(value))
}

export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const [result, setResult] = useState<PageResponse<AuditEvent> | null>(null)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const page = Number(params.get('page') ?? 0)

  useEffect(() => {
    void auditApi.list({
      action: params.get('action') || undefined,
      resourceType: params.get('resourceType') || undefined,
      actorId: params.get('actorId') || undefined,
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
      page, size: 20,
    }).then((data) => { setResult(data); setError('') })
      .catch((cause) => setError(apiErrorMessage(cause, 'Audit događaji nisu dostupni.')))
      .finally(() => setLoading(false))
  }, [page, params])

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ['action', 'resourceType', 'actorId', 'from', 'to']) {
      const value = String(data.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    setParams(next)
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(params); next.set('page', String(nextPage)); setParams(next)
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Administracija</p><h1>Audit evidencija</h1></div></div>
    <form className="filter-bar audit-filters" onSubmit={filter}>
      <label>Akcija<input name="action" defaultValue={params.get('action') ?? ''} /></label>
      <label>Tip resursa<input name="resourceType" defaultValue={params.get('resourceType') ?? ''} /></label>
      <label>Actor ID<input name="actorId" defaultValue={params.get('actorId') ?? ''} /></label>
      <label>Od<input name="from" type="date" defaultValue={params.get('from') ?? ''} /></label>
      <label>Do<input name="to" type="date" defaultValue={params.get('to') ?? ''} /></label>
      <button type="submit">Primeni</button>
    </form>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {loading ? <p className="empty-state">Učitavanje audit evidencije…</p>
      : !result?.content.length ? <p className="empty-state">Nema audit događaja za izabrane filtere.</p>
      : <div className="table-wrap"><table><thead><tr><th>Vreme</th><th>Akcija</th><th>Resurs</th><th>Actor</th><th /></tr></thead>
        <tbody>{result.content.map((item) => <tr key={item.id}>
          <td title={`UTC: ${item.occurredAt}`}>{localTime(item.occurredAt)}</td>
          <td>{item.action}</td><td>{item.resourceType} · {item.resourceId}</td>
          <td>{item.actorRole} · {item.actorId}</td>
          <td><button type="button" className="secondary-button" onClick={() => setSelected(item)}>Detalji</button></td>
        </tr>)}</tbody></table></div>}
    <div className="pagination"><button disabled={page === 0} onClick={() => changePage(page - 1)}>Prethodna</button>
      <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
      <button disabled={!result || page + 1 >= result.totalPages} onClick={() => changePage(page + 1)}>Sledeća</button></div>
    {selected && <div className="dialog-backdrop"><section className="panel audit-detail" role="dialog" aria-modal="true">
      <h2>{selected.action}</h2><p><strong>UTC:</strong> {selected.occurredAt}</p>
      {selected.reason && <p><strong>Razlog:</strong> {selected.reason}</p>}
      <h3>Pre promene</h3><pre>{selected.beforeData ?? '—'}</pre>
      <h3>Posle promene</h3><pre>{selected.afterData ?? '—'}</pre>
      <button type="button" onClick={() => setSelected(null)}>Zatvori</button>
    </section></div>}
  </main>
}
