import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination, Skeleton, ErrorState } from '../components/ui'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi } from '../api/gamingBillingApi'
import { Alert, Button, Input, TableShell } from '../components/ui'
import { reportPeriod, reportPreset } from './reportPresentation'
const labels: Record<string, string> = { recorded_RSD: 'Ručno evidentirano RSD', granted_seconds: 'Dodeljene sekunde', created_at: 'Datum', reference: 'POS referenca', reason: 'Napomena', kind: 'Vrsta', method: 'Način plaćanja', transactions: 'Broj operacija', amount: 'Iznos RSD', name: 'Naziv', actor_id: 'ID zaposlenog', resource_id: 'ID računara', location_id: 'ID lokacije', external_receipts: 'Primljeno gotovina / POS RSD', external_refunds: 'Vraćeno gotovina / POS RSD', status: 'Status', sessions: 'Broj sesija', duration_seconds: 'Potrošene sekunde', id: 'ID transakcije', customer_id: 'ID klijenta', customer_name: 'Klijent', orders_count: 'Broj narudžbina', order_value: 'Vrednost narudžbina RSD' }
const values: Record<string, string> = { TIME_GRANT: 'Ručna uplata i dodela vremena', TIME_REFUND: 'Povraćaj ručne uplate', CASH: 'Gotovina', EXTERNAL_POS: 'Spoljni POS', ACTIVE: 'Aktivna', TERMINATED: 'Završena', EXPIRED: 'Istekla' }
function Rows({ rows }: { rows: Record<string, string | number>[] }) {
  rows = rows.filter(Boolean)
  if (!rows.length) return <p>Nema stavki za izabrani period.</p>
  const keys = Object.keys(rows[0])
  return <TableShell label="Gaming finansijski pregled"><table className="ui-data-table"><thead><tr>{keys.map(k => <th scope="col" key={k}>{labels[k] ?? k}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{keys.map(k => <td key={k}>{values[String(r[k])] ?? String(r[k] ?? '')}</td>)}</tr>)}</tbody></table></TableShell>
}
function DetailRows({ table, from, until }: { table: string; from: string; until: string }) {
  const query = usePagedQuery(['gaming-billing', 'report', table, from, until], (page, size) => gamingBillingApi.reportDetails(table, from, until, page, size), 20)
  return <>{query.isLoading ? <Skeleton lines={3} /> : query.error ? <ErrorState message="Detalji nisu dostupni." action={<Button onClick={() => void query.refetch()}>Osveži</Button>} /> : <Rows rows={query.data?.content ?? []} />}
    {query.data && <Pagination page={query.page} onPageChange={query.setPage} totalPages={query.data.totalPages} totalElements={query.data.totalElements} pageSize={20} loading={query.isFetching} />}</>
}
export function GamingFinanceReport() {
  const [from, setFrom] = useState(() => reportPreset('month').from), [to, setTo] = useState(() => reportPreset('month').to)
  const [range, setRange] = useState(() => reportPeriod(from, to)), [error, setError] = useState('')
  const report = useQuery({ queryKey: ['gaming-billing', 'report', range], queryFn: () => gamingBillingApi.report(range.from, range.to) })
  return <section className="ui-card"><h2>Gaming finansije - interna evidencija RSD</h2>
    <form className="ui-actions" onSubmit={e => { e.preventDefault(); try { setRange(reportPeriod(from, to)); setError('') } catch { setError('Proverite period (najvise 366 dana).') } }}><label>Gaming finansije od<Input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label><label>Gaming finansije do (iskljucivo)<Input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label><Button>Prikazi</Button></form>
    {(error || report.error) && <Alert tone="danger">{error || 'Finansijski pregled nije dostupan.'}</Alert>}
    <p>Ručne uplate i povraćaji prikazuju se odvojeno. Cena novih dopuna obračunava se po podešenoj ceni minuta. Istorijska evidencija prikazana je zasebno i ne ulazi u aktuelne iznose. Potvrde su nefiskalne.</p>
    {report.isLoading && <Skeleton lines={5} />}
    {report.data && <><h3>Ručno evidentirane uplate i dodela vremena</h3><Rows rows={[report.data.manualTime]} /><p>Ukupni trajni saldo: {Math.floor(report.data.timeBalanceSeconds / 60)} min.</p><DetailRows table="manualPayments" from={range.from} until={range.to} />
      <h3>Ukupno evidentirano</h3><Rows rows={[report.data.totals]} />
      <h3>Evidentirane uplate i refundacije po nacinu placanja</h3><Rows rows={report.data.recorded} />
      <h3>Uplate prema mestu evidentiranja</h3><DetailRows table="byStation" from={range.from} until={range.to} />
      <h3>Lokacije</h3><DetailRows table="byLocation" from={range.from} until={range.to} /><h3>Aktivnosti zaposlenih</h3><DetailRows table="byEmployee" from={range.from} until={range.to} />
      <h3>Sesije i trajanje</h3><Rows rows={report.data.sessions} /><h3>Istorijska arhiva — odvojena od aktuelnog obračuna</h3>
      <p>Sačuvani istorijski novčani saldo: {report.data.historicalMoneyBalance} RSD. Ovaj iznos nije gaming vreme i ne može se trošiti.</p>
      <Rows rows={[report.data.historical]} /><DetailRows table="history" from={range.from} until={range.to} />
      <h3>Narudzbine proizvoda - odvojena vrednost po statusu</h3><Rows rows={report.data.productOrders} /><p>Za CSV/XLSX/PDF koristite definiciju Gaming finance u postojecem generatoru ispod.</p>
    </>}
  </section>
}
