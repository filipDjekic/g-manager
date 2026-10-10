import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { reportApi } from '../api/reportApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton } from '../components/ui'
import type { ReportDefinition, ReportFormat, ReportItem, ReportSchedule } from '../types/report.types'
import { useEncryptedDraft } from '../pwa/useEncryptedDraft'
import { useFeatureStore } from '../feature/featureStore'
import { aiApi } from '../api/aiApi'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AiFeedback, AiReportSummary } from '../types/ai.types'

const DAY = 86_400_000
const loadedAt = Date.now()
const defaultFrom = new Date(loadedAt - 30 * DAY).toISOString().slice(0, 10)
const defaultTo = new Date(loadedAt + DAY).toISOString().slice(0, 10)

export function ReportsPage() {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const user = useAuthStore((state) => state.user)
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([])
  const [items, setItems] = useState<ReportItem[]>([])
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [definition, setDefinition] = useState('orders')
  const [format, setFormat] = useState<ReportFormat>('CSV')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiSummary, setAiSummary] = useState<AiReportSummary | null>(null)
  const [aiConsent, setAiConsent] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const aiEnabled = useFeatureStore((state) => state.flags.AI_ASSISTANT)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Belgrade'
  const manage = hasCapability(user, 'REPORT_MANAGE')
  const draftValue = { definition, format, from, to }
  const draft = useEncryptedDraft(user?.id, 'report-generator', 1, draftValue, (saved) => {
    setDefinition(saved.definition); setFormat(saved.format); setFrom(saved.from); setTo(saved.to)
  })

  const refresh = useCallback(async () => {
    try {
      const [available, reports, plans] = await Promise.all([
        reportApi.definitions(), reportApi.list(), manage ? reportApi.schedules() : Promise.resolve([]),
      ])
      setDefinitions(available); setItems(reports); setSchedules(plans); setError('')
    } catch (cause) { setError(apiErrorMessage(cause, 'Izveštaji nisu dostupni.')) }
    finally { setLoading(false) }
  }, [manage])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const poll = window.setInterval(() => void refresh(), 5000)
    return () => { window.clearTimeout(initial); window.clearInterval(poll) }
  }, [refresh])

  const payload = () => ({ definitionKey: definition, format,
    from: new Date(`${from}T00:00:00Z`).toISOString(), to: new Date(`${to}T00:00:00Z`).toISOString(),
    timezone, locale: navigator.language })

  async function generate() {
    setBusy(true)
    try { await reportApi.generate(payload()); await draft.discard(); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause, 'Generisanje nije pokrenuto.')) }
    finally { setBusy(false) }
  }

  async function download(item: ReportItem) {
    try {
      const url = await reportApi.download(item.id); const link = document.createElement('a')
      link.href = url; link.download = `${item.definitionKey}.${item.format.toLowerCase()}`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(apiErrorMessage(cause, 'Preuzimanje nije dostupno.')) }
  }

  async function summarize(item: ReportItem) {
    if (!aiConsent) { setError('Potvrdite slanje ograničenih metapodataka AI provider-u.'); return }
    setAiBusy(true)
    try { setAiSummary(await aiApi.summarize(item.id)); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'AI sažetak nije dostupan; koristite izvorni izveštaj.')) }
    finally { setAiBusy(false) }
  }

  async function feedback(value: AiFeedback) {
    if (!aiSummary) return
    try { await aiApi.feedback(aiSummary.usageId, value); setAiSummary(null); setAiConsent(false) }
    catch (cause) { setError(apiErrorMessage(cause, 'Povratna informacija nije sačuvana.')) }
  }

  return <main className="workspace">{confirmationDialog}<PageHeader eyebrow="Asinhrona obrada" title="Izveštaji" />
    {draft.recovered && <p role="status" className="connectivity-banner">Oporavljen je šifrovani lokalni draft. Pregledajte podatke pre slanja. <Button variant="secondary" onClick={draft.acknowledge}>U redu</Button></p>}
    <Card><h2>Novi izveštaj</h2><div className="form-grid">
      <label>Definicija<Select value={definition} onChange={(event) => setDefinition(event.target.value)}>
        {definitions.map((value) => <option key={value.key} value={value.key}>{value.label}</option>)}</Select></label>
      <label>Format<Select value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
        <option>CSV</option><option>XLSX</option><option>PDF</option></Select></label>
      <label>Od<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Do<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div><p>{definitions.find((value) => value.key === definition)?.metricDefinition} · Zona: {timezone}</p>
    <Button loading={busy} onClick={() => void generate()}>Generiši</Button>
    <Button variant="secondary" onClick={async () => { try { const value = payload(); await reportApi.createTemplate({ name: `${definition} ${from}`, definitionKey: definition, format, from: value.from, to: value.to }) } catch (cause) { setError(apiErrorMessage(cause, 'Šablon nije sačuvan.')) } }}>Sačuvaj kao šablon</Button>
    {manage && <Button variant="secondary" onClick={async () => { try {
      await reportApi.createSchedule({ ...payload(), localTime: '08:00', dayOfWeek: 1 }); await refresh()
    } catch (cause) { setError(apiErrorMessage(cause, 'Raspored nije sačuvan.')) } }}>Zakaži ponedeljkom u 08:00</Button>}</Card>
    {error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />}
    {loading ? <Skeleton lines={5} /> : !items.length ? <EmptyState title="Nema izveštaja" description="Pokrenite prvi izveštaj." /> :
      <Card><h2>Istorija</h2><div className="table-scroll"><table className="responsive-table"><thead><tr><th>Izveštaj</th><th>Format</th><th>Status</th><th>Redovi</th><th>Akcije</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td data-label="Izveštaj">{definitions.find((definition) => definition.key === item.definitionKey)?.label ?? item.definitionKey}</td><td data-label="Format">{item.format}</td><td data-label="Status"><Badge tone={item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'danger' : item.status === 'RUNNING' ? 'info' : 'neutral'}>{{ QUEUED:'Na čekanju', RUNNING:'U obradi', COMPLETED:'Spreman', FAILED:'Neuspešno', CANCELLED:'Otkazan', EXPIRED:'Istekao' }[item.status]} {item.status === 'RUNNING' && `${item.progress}%`}</Badge>{item.errorMessage && <small>{item.errorMessage}</small>}</td><td data-label="Redovi">{item.rowCount ?? '—'}</td><td data-label="Akcije">
          {item.status === 'COMPLETED' && <Button onClick={() => void download(item)}>Preuzmi</Button>}
          {item.status === 'COMPLETED' && aiEnabled && <Button variant="secondary" loading={aiBusy} onClick={() => void summarize(item)}>AI sažetak</Button>}
          {['QUEUED', 'RUNNING'].includes(item.status) && <Button variant="secondary" onClick={() => confirm({ title: 'Otkaži generisanje', description: 'Obrada izveštaja biće zaustavljena.', variant: 'warning', confirmLabel: 'Otkaži obradu', onConfirm: async () => { await reportApi.cancel(item.id); await refresh() } })}>Otkaži</Button>}
        </td></tr>)}</tbody></table></div></Card>}
    {manage && <Card><h2>Rasporedi</h2>{!schedules.length ? <p>Nema rasporeda.</p> : <ul>{schedules.map((schedule) =>
      <li key={schedule.id}>{definitions.find((definition) => definition.key === schedule.definitionKey)?.label ?? schedule.definitionKey} · {schedule.timezone} · sledeće {formatBusinessDateTime(schedule.nextRunAt)} <Button variant="danger" onClick={() => confirm({ title: 'Obriši raspored izveštaja', description: 'Automatsko generisanje po ovom rasporedu biće uklonjeno.', variant: 'danger', confirmLabel: 'Obriši raspored', onConfirm: async () => { await reportApi.removeSchedule(schedule.id); await refresh() } })}>Obriši</Button></li>)}</ul>}</Card>}
    {aiEnabled && <Card><h2>AI asistencija (eksperimentalno)</h2><p>AI dobija samo definiciju, broj redova i vreme preseka izveštaja. Rezultat može biti netačan; izvorni izveštaj ostaje merodavan.</p>
      <label><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /> Saglasan/na sam sa obradom ovih ograničenih metapodataka.</label></Card>}
    {aiSummary && <Card><h2>{aiSummary.aiGenerated ? 'AI sažetak' : 'Sažetak bez AI-a'}</h2><p role="status">{aiSummary.summary}</p><p><strong>Ograničenja:</strong> {aiSummary.limitations}</p>
      <h3>Izvori</h3><ul>{aiSummary.sources.map((source) => <li key={source.reportId}>Izveštaj {source.definition}, {source.rowCount} redova, presek {new Date(source.snapshotAt).toLocaleString()}</li>)}</ul>
      <p>Pregledajte rezultat pre bilo kakve odluke.</p><Button onClick={() => void feedback('ACCEPTED')}>Prihvati</Button><Button variant="secondary" onClick={() => void feedback('CORRECTED')}>Ispravljeno</Button><Button variant="danger" onClick={() => void feedback('REJECTED')}>Odbaci</Button></Card>}
  </main>
}
