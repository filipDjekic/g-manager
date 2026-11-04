import { usePagedQuery } from '../query/usePagedQuery'
import { useQueryClient } from '@tanstack/react-query'
import { Pagination } from '../components/ui/Pagination'
import { GamingFinanceReport } from '../reports/GamingFinanceReport'
import { ReportScheduleDialog } from '../reports/ReportScheduleDialog'
import { reportLabels, reportDefinitions, reportPreset, reportPeriod, templatePeriod } from '../reports/reportPresentation'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { reportApi } from '../api/reportApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, PageLayout, Input, TableShell } from '../components/ui'
import type { ReportDefinition, ReportFormat, ReportItem, ReportTemplate, GenerateReport } from '../types/report.types'
import { useEncryptedDraft } from '../pwa/useEncryptedDraft'
import { useFeatureStore } from '../feature/featureStore'
import { aiApi } from '../api/aiApi'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AiFeedback, AiReportSummary } from '../types/ai.types'
import { NavigationIcon } from '../layout/NavigationIcon'
import '../reports/reports.css'

export function ReportsPage() {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const user = useAuthStore((state) => state.user)
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([])
  const cache = useQueryClient()
  const history = usePagedQuery(['reports', 'history', user?.id], reportApi.list, 10, true, data => data?.content.some(item => ['QUEUED', 'RUNNING'].includes(item.status)) ? 5000 : false)
  const scheduleHistory = usePagedQuery(['reports', 'schedules', user?.id], reportApi.schedules, 10, hasCapability(user, 'REPORT_MANAGE'))
  const items = history.data?.content ?? []
  const schedules = scheduleHistory.data?.content ?? []
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [schedulePayload, setSchedulePayload] = useState<GenerateReport | null>(null)
  const [definition, setDefinition] = useState('orders')
  const [templateRange, setTemplateRange] = useState<{from:string;to:string}|null>(null)
  const [format, setFormat] = useState<ReportFormat>('CSV')
  const [from, setFrom] = useState(() => reportPreset('30days').from)
  const [to, setTo] = useState(() => reportPreset('30days').to)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiSummary, setAiSummary] = useState<AiReportSummary | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const aiEnabled = useFeatureStore((state) => state.flags.AI_ASSISTANT)
  const timezone = 'Europe/Belgrade'
  useDirtyGuard(busy || aiBusy, { pending: busy || aiBusy })
  const manage = hasCapability(user, 'REPORT_MANAGE')
  const draftValue = { definition, format, from, to, templateRange }
  const draft = useEncryptedDraft(user?.id, 'report-generator', 1, draftValue, (saved) => {
    setTemplateRange(saved.templateRange ?? null); setDefinition(saved.definition); setFormat(saved.format); setFrom(saved.from); setTo(saved.to)
  })

  const refresh = useCallback(() =>
    Promise.allSettled([
        reportApi.definitions(), cache.invalidateQueries({ queryKey: ['reports', 'history'] }), cache.invalidateQueries({ queryKey: ['reports', 'schedules'] }), reportApi.templates(),
      ] as const).then(results => {
      if (results[0].status === 'fulfilled') setDefinitions(results[0].value)
      if (results[3].status === 'fulfilled') setTemplates(results[3].value)
      const failure = results.find(value => value.status === 'rejected')
      setError(failure?.status === 'rejected' ? apiErrorMessage(failure.reason, 'Deo izveštaja nije dostupan. Osvežite pregled.') : '')
      }).catch(cause => setError(apiErrorMessage(cause, 'Izveštaji nisu dostupni.')))
      .finally(() => setLoading(false)), [cache])

  useEffect(() => { void refresh() }, [refresh])
  const payload = (): GenerateReport => ({ definitionKey: definition, format, ...(templateRange ?? reportPeriod(from, to)), timezone, locale: navigator.language })
  function preset(value: string) { setTemplateRange(null); const period = reportPreset(value); setFrom(period.from); setTo(period.to) }
  function chooseTemplate(id: string) {
    const template = templates.find(value => value.id === id); if (!template) return
    try { const period = templatePeriod(template); setTemplateRange(period.exact); setDefinition(template.definitionKey); setFormat(template.format); setFrom(period.from); setTo(period.to); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Šablon nije moguće primeniti.')) }
  }
  function saveTemplate() {
    try {
      const value = payload()
      confirm({ title: 'Sačuvaj šablon', description: 'Šablon čuva tip, format i ovaj fiksni period. Pre generisanja možete promeniti datume.',
        reasonLabel: 'Naziv šablona', reasonRequired: true, reasonMaxLength: 100, inputMode: 'text', confirmLabel: 'Sačuvaj šablon',
        onConfirm: async name => { await reportApi.createTemplate({ name: name!, definitionKey: definition, format, from: value.from, to: value.to }); await refresh() } })
    } catch (cause) { setError(apiErrorMessage(cause, 'Proverite datumski period.')) }
  }
  async function generate() {
    setBusy(true)
    try { await reportApi.generate(payload()); history.setPage(0); await draft.discard(); await refresh() }
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
    setAiBusy(true)
    try { setAiSummary(await aiApi.summarize(item.id)); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'AI sažetak nije dostupan; koristite izvorni izveštaj.')) }
    finally { setAiBusy(false) }
  }

  async function feedback(value: AiFeedback) {
    if (!aiSummary) return
    try { await aiApi.feedback(aiSummary.usageId, value); setAiSummary(null) }
    catch (cause) { setError(apiErrorMessage(cause, 'Povratna informacija nije sačuvana.')) }
  }

  return <PageLayout className="gm-reports">{confirmationDialog}<PageHeader eyebrow="Asinhrona obrada" title="Izveštaji" icon={<NavigationIcon to="/reports" />} description="Kreiranje, preuzimanje i zakazivanje izveštaja." />
    {draft.recovered && <p role="status" className="connectivity-banner">Oporavljen je šifrovani lokalni draft. Pregledajte podatke pre slanja. <Button variant="secondary" onClick={draft.acknowledge}>U redu</Button></p>}
    <Card><h2>Novi izveštaj</h2>
      <div className="ui-actions">{[{value:'today',label:'Danas'},{value:'week',label:'Poslednjih 7 dana'},{value:'month',label:'Ovaj mesec'},{value:'30days',label:'Poslednjih 30 dana'}].map(value => <Button key={value.value} variant="secondary" disabled={busy} onClick={() => preset(value.value)}>{value.label}</Button>)}</div>
      <label>Sačuvani šabloni<Select value="" onChange={event => chooseTemplate(event.target.value)} disabled={busy}><option value="">Izaberite šablon</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></label>
      <div className="form-grid gm-report-fields">
      <label>Definicija<Select aria-label={"Definicija"} value={definition} onChange={(event) => setDefinition(event.target.value)}>
        {definitions.map((value) => <option key={value.key} value={value.key}>{reportLabels[value.key] ?? value.label}</option>)}</Select></label>
      <label>Format<Select aria-label={"Format"} value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
        <option>CSV</option><option>XLSX</option><option>PDF</option></Select></label>
      <label>Od<Input aria-label={"Od"} type="date" value={from} onChange={(event) => { setTemplateRange(null); setFrom(event.target.value) }} /></label>
      <label>Do (datum nije uključen)<Input aria-label="Do - isključivi kraj" type="date" value={to} onChange={(event) => { setTemplateRange(null); setTo(event.target.value) }} /></label>
    </div><p>{reportDefinitions[definition] ?? definitions.find((value) => value.key === definition)?.metricDefinition} · Zona: {timezone}</p>
    {templateRange&&<p>Period sačuvan u šablonu: {formatBusinessDateTime(templateRange.from)} - {formatBusinessDateTime(templateRange.to)} (isključivi kraj). Promena datuma primenjuje poslovnu ponoć.</p>}
    <p>Od 00:00 prvog datuma do 00:00 krajnjeg datuma u poslovnoj zoni. Krajnji datum nije uključen. Opseg izveštaja prati serverske dozvole; izveštaj zaposlenog nije nužno ograničen na njegove dodele.</p>
    <div className="ui-actions"><Button loading={busy} disabled={!definitions.length} onClick={() => void generate()}>Generiši</Button>
    <Button variant="secondary" disabled={busy} onClick={saveTemplate}>Sačuvaj šablon</Button>
    {manage && <Button variant="secondary" disabled={busy} onClick={() => { try { setSchedulePayload(payload()) } catch (cause) { setError(apiErrorMessage(cause, 'Proverite datumski period.')) } }}>Zakaži izveštaj</Button>}</div></Card>
    {error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />}
    {(loading || history.isLoading) ? <Skeleton lines={5} /> : history.error ? null : !items.length ? <EmptyState title="Nema izveštaja" description="Pokrenite prvi izveštaj." /> :
      <Card><h2>Istorija</h2><TableShell label="Tabelarni pregled" className="table-scroll"><table className="ui-data-table"><thead><tr><th>Izveštaj</th><th>Format</th><th>Status</th><th>Redovi</th><th>Akcije</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td data-label="Izveštaj">{reportLabels[item.definitionKey] ?? item.definitionKey}</td><td data-label="Format">{item.format}</td><td data-label="Status"><Badge tone={item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'danger' : item.status === 'RUNNING' ? 'info' : 'neutral'}>{{ QUEUED:'Na čekanju', RUNNING:'U obradi', COMPLETED:'Spreman', FAILED:'Neuspešno', CANCELLED:'Otkazan', EXPIRED:'Istekao' }[item.status]} {item.status === 'RUNNING' && `${item.progress}%`}</Badge>{item.errorMessage && <small>{item.errorMessage}</small>}</td><td data-label="Redovi">{item.rowCount ?? '-'}</td><td data-label="Akcije"><div className="ui-actions">
          {item.status === 'COMPLETED' && <Button onClick={() => void download(item)}>Preuzmi</Button>}
          {item.status === 'COMPLETED' && aiEnabled && <Button variant="secondary" loading={aiBusy} onClick={() => confirm({ title:'AI sažetak ovog izveštaja', description:'Saglasnošću šaljete AI provider-u definiciju, broj redova i vreme preseka ovog izveštaja. Rezultat može biti netačan; izvorni izveštaj ostaje merodavan.', confirmLabel:'Pristajem - napravi sažetak', onConfirm:()=>summarize(item) })}>AI sažetak</Button>}
          {['QUEUED', 'RUNNING'].includes(item.status) && <Button variant="secondary" onClick={() => confirm({ title: 'Otkaži generisanje', description: 'Obrada izveštaja biće zaustavljena.', variant: 'warning', confirmLabel: 'Otkaži obradu', onConfirm: async () => { await reportApi.cancel(item.id); await refresh() } })}>Otkaži</Button>}
        </div></td></tr>)}</tbody></table></TableShell></Card>}
    {history.error && <ErrorState message={apiErrorMessage(history.error, 'Istorija nije dostupna.')} action={<Button onClick={() => void history.refetch()}>Osveži</Button>} />}
    {history.data && <Pagination label="Stranice istorije izvestaja" page={history.page} onPageChange={history.setPage} totalPages={history.data.totalPages} totalElements={history.data.totalElements} pageSize={10} loading={history.isFetching} />}
    {manage && <Card><h2>Rasporedi</h2>{scheduleHistory.isLoading ? <Skeleton lines={3} /> : scheduleHistory.error ? <ErrorState message={apiErrorMessage(scheduleHistory.error, 'Rasporedi nisu dostupni.')} action={<Button onClick={() => void scheduleHistory.refetch()}>Osveži</Button>} /> : !schedules.length ? <p>Nema rasporeda.</p> : <ul>{schedules.map((schedule) =>
      <li key={schedule.id}>{reportLabels[schedule.definitionKey] ?? schedule.definitionKey} · {schedule.dayOfWeek === null ? 'Svakog dana' : ['Ponedeljak','Utorak','Sreda','Četvrtak','Petak','Subota','Nedelja'][schedule.dayOfWeek-1]} u {schedule.localTime} · {schedule.timezone} · sledeće {formatBusinessDateTime(schedule.nextRunAt)} <Button variant="danger" onClick={() => confirm({ title: 'Obriši raspored izveštaja', description: 'Automatsko generisanje po ovom rasporedu biće uklonjeno.', variant: 'danger', confirmLabel: 'Obriši raspored', onConfirm: async () => { await reportApi.removeSchedule(schedule.id); await refresh() } })}>Obriši</Button></li>)}</ul>}{scheduleHistory.data && <Pagination label="Stranice rasporeda izvestaja" page={scheduleHistory.page} onPageChange={scheduleHistory.setPage} totalPages={scheduleHistory.data.totalPages} totalElements={scheduleHistory.data.totalElements} pageSize={10} loading={scheduleHistory.isFetching} />}</Card>}
    {aiSummary && <Card><h2>{aiSummary.aiGenerated ? 'AI sažetak' : 'Sažetak bez AI-a'}</h2><p role="status">{aiSummary.summary}</p><p><strong>Ograničenja:</strong> {aiSummary.limitations}</p>
      <h3>Izvori</h3><ul>{aiSummary.sources.map((source) => <li key={source.reportId}>Izveštaj {source.definition}, {source.rowCount} redova, presek {formatBusinessDateTime(source.snapshotAt)}</li>)}</ul>
      <p>Pregledajte rezultat pre bilo kakve odluke.</p><Button onClick={() => void feedback('ACCEPTED')}>Prihvati</Button><Button variant="secondary" onClick={() => void feedback('CORRECTED')}>Ispravljeno</Button><Button variant="danger" onClick={() => void feedback('REJECTED')}>Odbaci</Button></Card>}
    {schedulePayload && manage && <ReportScheduleDialog payload={schedulePayload} onClose={() => setSchedulePayload(null)} onSaved={() => { scheduleHistory.setPage(0); void refresh() }} />}
    {hasCapability(user, 'GAMING_FINANCE_MANAGE') && <GamingFinanceReport />}
  </PageLayout>
}
