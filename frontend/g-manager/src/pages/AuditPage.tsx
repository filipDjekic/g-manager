import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auditApi } from '../api/auditApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Pagination, Modal, Skeleton, TableShell } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
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
  const [loadAttempt, setLoadAttempt] = useState(0)
  const page = Math.max(0, Number(params.get('page')) || 0)

  useEffect(() => {
    let active = true
    setLoading(true)
    void auditApi.list({
      action: params.get('action') || undefined,
      resourceType: params.get('resourceType') || undefined,
      actorId: params.get('actorId') || undefined,
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
      page, size: 20,
    }).then((data) => { if (active) { setResult(data); setError('') } })
      .catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Audit događaji nisu dostupni.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, params, loadAttempt])

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
      <label>Identifikator korisnika<input name="actorId" placeholder="ID iz detalja događaja" defaultValue={params.get('actorId') ?? ''} /></label>
      <label>Od<input name="from" type="date" defaultValue={params.get('from') ?? ''} /></label>
      <label>Do<input name="to" type="date" defaultValue={params.get('to') ?? ''} /></label>
      <Button type="submit" loading={loading}>Primeni</Button>
    </form>
    {error && <ErrorState message={error} action={<Button onClick={() => setLoadAttempt((value) => value + 1)}>Pokušaj ponovo</Button>} />}
    {loading ? <Skeleton lines={5} label="Učitavanje audit evidencije" />
      : error ? null : !result?.content.length ? <EmptyState title="Nema audit događaja za izabrane filtere" action={<Button variant="secondary" onClick={() => setParams({})}>Poništi filtere</Button>} />
      : <TableShell label="Audit evidencija"><table className="responsive-table"><thead><tr><th>Vreme</th><th>Akcija</th><th>Resurs</th><th>Korisnik</th><th>Detalji</th></tr></thead>
        <tbody>{result.content.map((item) => <tr key={item.id}>
          <td data-label="Vreme" title={`UTC: ${item.occurredAt}`}>{localTime(item.occurredAt)}</td>
          <td data-label="Akcija">{item.action}</td><td data-label="Resurs">{item.resourceType}</td>
          <td data-label="Korisnik"><Badge>{roleLabels[item.actorRole]}</Badge></td>
          <td data-label="Detalji"><Button type="button" variant="secondary" onClick={() => setSelected(item)}>Detalji</Button></td>
        </tr>)}</tbody></table></TableShell>}
    <Pagination page={page} totalPages={result?.totalPages} onPageChange={changePage} loading={loading} />
    <Modal open={selected !== null} title={selected?.action ?? 'Detalji audit događaja'} onClose={() => setSelected(null)}>
      {selected && <div className="audit-detail"><p><strong>UTC:</strong> {selected.occurredAt}</p>
      <p><strong>Korisnik:</strong> {roleLabels[selected.actorRole]} · <code>{selected.actorId}</code></p>
      <p><strong>Resurs:</strong> {selected.resourceType} · <code>{selected.resourceId}</code></p>
      {selected.reason && <p><strong>Razlog:</strong> {selected.reason}</p>}
      <h3>Pre promene</h3><pre>{selected.beforeData ?? '—'}</pre>
      <h3>Posle promene</h3><pre>{selected.afterData ?? '—'}</pre>
      </div>}
    </Modal>
  </main>
}
