import { Button, ErrorState, Skeleton, StatCard } from '../components/ui'
import type { AuditStatistics } from '../types/audit.types'
import { AuditIcon } from './auditPresentation'
import { type AuditIconKind } from './auditPresentation.model'

const metrics: { key: 'total' | 'created' | 'updated' | 'removed'; label: string; icon: AuditIconKind; tone: string }[] = [
  { key: 'total', label: 'Ukupno događaja', icon: 'file', tone: 'blue' },
  { key: 'created', label: 'Kreiranje', icon: 'create', tone: 'pink' },
  { key: 'updated', label: 'Izmene', icon: 'update', tone: 'purple' },
  { key: 'removed', label: 'Brisanja i deaktivacije', icon: 'deactivate', tone: 'warning' },
]
export function AuditStatisticsCards({ data, loading, error, period, retry }: {
  data?: AuditStatistics; loading: boolean; error?: string; period: string; retry: () => void
}) {
  return <section className="gm-audit-statistics" aria-label="Statistika audit događaja" aria-busy={loading}>
    <div className="gm-audit-period-note"><AuditIcon kind="clock" /><span>Izabrani period: <strong>{period}</strong> · svi dozvoljeni događaji za primenjene kriterijume</span></div>
    <div className="ui-stat-grid gm-audit-kpis">{metrics.map(metric => <StatCard label={<>{metric.label}</>} value={loading ? <Skeleton lines={1} label={`Učitavanje: ${metric.label}`} /> : <>{!error && data ? new Intl.NumberFormat('sr-Latn-RS').format(data[metric.key]) : '-'}</>} icon={<AuditIcon kind={metric.icon} />} description={<>{metric.key === 'total' ? 'Cela filtrirana evidencija' : 'Prema zabeleženim akcijama'}</>} tone={metric.tone} key={metric.key} />)}</div>
    {error && <ErrorState title="Statistika nije dostupna" message={error} action={<Button type="button" variant="secondary" onClick={retry}>Pokušaj ponovo</Button>} />}
    {!loading && !error && data && <details className="gm-audit-stat-definition"><summary>Obuhvat pokazatelja</summary>
      <p>Ukupan broj obuhvata sve dozvoljene događaje za izabrani period, pretragu i filtere. Kategorije se računaju prema sledećim stvarnim action vrednostima; ostale akcije ulaze samo u ukupan broj.</p>
      <dl><div><dt>Kreiranje</dt><dd>{data.creationActions.join(', ')}</dd></div><div><dt>Izmene</dt><dd>{data.updateActions.join(', ')}</dd></div>
        <div><dt>Brisanja i deaktivacije</dt><dd>{data.removalActions.join(', ')}</dd></div></dl>
    </details>}
  </section>
}
