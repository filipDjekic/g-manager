import { useMemo } from 'react'
import { Button, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import { useToast } from '../components/ui/toastContext'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AuditEvent } from '../types/audit.types'
import { AuditIcon } from './auditPresentation'
import { actionTone, categoryLabels } from './auditPresentation.model'
import { compareSnapshots, parseSnapshot, snapshotLines, changeText, type AuditChange, type Snapshot } from './auditDiff'

function SnapshotView({ snapshot, side, changes }: { snapshot: Snapshot; side: 'before' | 'after'; changes: AuditChange[] }) {
  const lines = useMemo(() => snapshotLines(snapshot), [snapshot])
  const isChanged = (path: string) => changes.some(change => change.path === path || path.startsWith(`${change.path}/`))
  return <section className={`gm-audit-snapshot gm-audit-snapshot--${side}`}>
    <h4>{side === 'before' ? 'Pre' : 'Posle'}<span>{snapshot.kind === 'json' ? 'JSON' : snapshot.kind === 'text' ? 'Tekst' : 'Bez podataka'}</span></h4>
    {snapshot.kind === 'missing' ? <p className="gm-audit-snapshot-empty">{side === 'before' ? 'Nema prethodnog stanja' : 'Nema narednog stanja'}</p>
      : <pre tabIndex={0} aria-label={side === 'before' ? 'Stanje pre promene' : 'Stanje posle promene'}><code>
        {lines ? lines.map((line, index) => <span key={index} className={`gm-audit-json-line${isChanged(line.path) ? ' is-changed' : ''}`}>{line.text}</span>)
          : <span className={changes.length ? 'gm-audit-json-line is-changed' : ''}>{snapshot.raw}</span>}
      </code></pre>}
    {snapshot.kind === 'text' && <p className="gm-audit-snapshot-note">Zapis nije validan JSON. Prikazan je izvorni tekst.</p>}
  </section>
}

function EventChanges({ event }: { event: AuditEvent }) {
  const before = useMemo(() => parseSnapshot(event.beforeData), [event.beforeData])
  const after = useMemo(() => parseSnapshot(event.afterData), [event.afterData])
  const comparison = useMemo(() => compareSnapshots(before, after), [before, after])
  return <section className="gm-audit-changes" aria-label="Prikaz promena">
    <h3>Prikaz promena</h3>
    <div className="gm-audit-snapshots"><SnapshotView snapshot={before} side="before" changes={comparison.changes} />
      <SnapshotView snapshot={after} side="after" changes={comparison.changes} /></div>
    <div className="gm-audit-changes-heading"><h3>Promenjena polja</h3>{!comparison.limited && <span>{comparison.changes.length}</span>}</div>
    {comparison.limited ? <p className="gm-audit-muted">Zapis je prevelik ili previše duboko strukturiran za detaljno poređenje polja. Kompletna stanja prikazana su iznad.</p>
      : comparison.changes.length ? <TableShell label="Stvarne razlike između stanja"><table className="gm-audit-diff-table">
        <thead><tr><th scope="col">Polje</th><th scope="col">Pre</th><th scope="col">Posle</th></tr></thead>
        <tbody>{comparison.changes.map(change => <tr key={change.path}><th scope="row">{change.label}</th>
          <td className="gm-audit-old-value"><pre>{changeText(change.before)}</pre></td>
          <td className="gm-audit-new-value"><pre>{changeText(change.after)}</pre></td></tr>)}</tbody>
      </table></TableShell>
        : <p className="gm-audit-muted">{before.kind === 'missing' && after.kind === 'missing' ? 'Za ovaj događaj nisu zabeležena stanja za poređenje.' : 'Nema razlika u zabeleženim stanjima.'}</p>}
  </section>
}

export function AuditDetailsPanel({ event, loading, error, retry, onClose, inline = false }: {
  event?: AuditEvent; loading: boolean; error?: string; retry?: () => void; onClose: () => void; inline?: boolean
}) {
  const toast = useToast()
  async function copyId() {
    if (!event) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(event.id)
      toast('ID događaja je kopiran.', 'success')
    } catch { toast('ID nije moguće kopirati. Možete ga označiti i kopirati ručno.', 'error') }
  }
  return <div className="gm-audit-detail-content">
    {inline && <header className="gm-audit-panel-heading"><h2><AuditIcon kind="shield" />Detalji događaja</h2>
      {event || loading || error ? <Button type="button" variant="secondary" onClick={onClose} aria-label="Zatvori detalje događaja"><AuditIcon kind="close" /></Button> : null}</header>}
    {loading ? <Skeleton lines={7} label="Učitavanje detalja događaja" />
      : error ? <ErrorState message={error} action={retry && <Button type="button" variant="secondary" onClick={retry}>Pokušaj ponovo</Button>} />
        : !event ? <EmptyState title="Izaberite događaj" description="Otvorite detalje u vremenskoj liniji za pregled izvršioca, resursa i zabeleženih promena." />
          : <>
            <div className={`gm-audit-event-summary gm-audit-tone--${actionTone(event)}`}><span className="gm-audit-action-icon"><AuditIcon kind={actionTone(event)} /></span>
              <div><p>{categoryLabels[event.category] ?? 'Događaj'}</p><h3>{event.action}</h3></div></div>
            <dl className="gm-audit-metadata">
              <div><dt>ID događaja</dt><dd className="gm-audit-id-value"><code>{event.id}</code><Button type="button" variant="secondary" onClick={() => void copyId()} aria-label="Kopiraj ID događaja"><AuditIcon kind="copy" /></Button></dd></div>
              <div><dt>Datum i vreme</dt><dd><time dateTime={event.occurredAt}>{formatBusinessDateTime(event.occurredAt, true, 'sr-Latn-RS')}</time><small>Europe/Belgrade · UTC: {event.occurredAt}</small></dd></div>
              <div><dt>Izvršilac</dt><dd>{roleLabels[event.actorRole]}<code>{event.actorId}</code></dd></div>
              <div><dt>Akcija</dt><dd><code>{event.action}</code></dd></div>
              <div><dt>Tip resursa</dt><dd>{event.resourceType}</dd></div>
              <div><dt>ID resursa</dt><dd><code>{event.resourceId}</code></dd></div>
              {event.reason && <div><dt>Razlog</dt><dd className="gm-audit-reason">{event.reason}</dd></div>}
            </dl>
            <EventChanges event={event} />
          </>}
  </div>
}
