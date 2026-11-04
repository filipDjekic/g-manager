import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination, Skeleton, ErrorState } from '../components/ui'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi } from '../api/gamingBillingApi'
import { Alert, Button, Input, TableShell } from '../components/ui'
import { reportPeriod, reportPreset } from './reportPresentation'
const labels: Record<string, string> = { kind: 'Vrsta', method: 'Nacin placanja', transactions: 'Broj operacija', amount: 'Iznos RSD', name: 'Naziv', allocated_gaming_revenue: 'Vrednost gaming vremena RSD', purchased_minutes: 'Kupljeni minuti', actor_id: 'ID zaposlenog', resource_id: 'ID racunara', location_id: 'ID lokacije', external_receipts: 'Primljeno gotovina / POS RSD', external_refunds: 'Vraceno gotovina / POS RSD', gaming_collected: 'Gaming uplate RSD (ukljucen prepaid)', net_gaming_collected: 'Neto gaming uplate RSD', gaming_refunds: 'Gaming refundacije RSD', status: 'Status', sessions: 'Broj sesija', duration_seconds: 'Trajanje u sekundama', id: 'ID paketa', customer_id: 'ID klijenta', customer_name: 'Klijent', expires_at: 'Rok vazenja', price: 'Kupljena vrednost RSD', minutes: 'Kupljeni minuti', remaining_minutes: 'Preostali minuti', orders_count: 'Broj narudzbina', order_value: 'Vrednost narudzbina RSD' }
const values: Record<string, string> = { PAYMENT: 'Gaming uplata', REFUND: 'Refundacija', CREDIT_TOPUP: 'Dopuna kredita', PACKAGE_SALE: 'Prodaja paketa', CREDIT_CORRECTION: 'Korekcija kredita', CASH: 'Gotovina', EXTERNAL_POS: 'Spoljni POS', WALLET: 'Potrosnja prepaid kredita', ACTIVE: 'Aktivna', TERMINATED: 'Zavrsena', EXPIRED: 'Istekla' }
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
    <p>PAYMENT je evidentirana gaming uplata; REFUND se prikazuje zasebno. CREDIT_TOPUP je uplata prepaid obaveze, PACKAGE_SALE kupljen paket; WALLET uplata je potrosnja ranije kupljenog kredita. Ove kategorije se ne sabiraju kao novi gotovinski promet. Iznosi narudzbina su poseban pregled proizvoda. Sve potvrde su nefiskalne.</p>
    {report.isLoading && <Skeleton lines={5} />}
    {report.data && <><p>Trenutne neplacene gaming obaveze (svi periodi): {report.data.outstandingDebt} RSD. Trenutni prepaid saldo (svi periodi): {report.data.prepaidLiability} RSD. Vrednost aktivnih neiskoriscenih paketa: {report.data.activePackageLiability} RSD.</p>
      <h3>Ukupno evidentirano (bez dvostrukog sabiranja prepaid uplata i potrosnje)</h3><Rows rows={[report.data.totals]} />
      <h3>Evidentirane uplate i refundacije po nacinu placanja</h3><Rows rows={report.data.recorded} />
      <h3>Vrednost kupljenog gaming vremena po racunaru</h3><DetailRows table="byStation" from={range.from} until={range.to} />
      <h3>Lokacije</h3><DetailRows table="byLocation" from={range.from} until={range.to} /><h3>Aktivnosti zaposlenih</h3><DetailRows table="byEmployee" from={range.from} until={range.to} />
      <h3>Sesije i trajanje</h3><Rows rows={report.data.sessions} /><h3>Trenutni neiskorisceni paketi</h3><DetailRows table="packages" from={range.from} until={range.to} />
      <h3>Narudzbine proizvoda - odvojena vrednost po statusu</h3><Rows rows={report.data.productOrders} /><p>Za CSV/XLSX/PDF koristite definiciju Gaming finance u postojecem generatoru ispod.</p>
    </>}
  </section>
}
