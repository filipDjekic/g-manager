import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination, Skeleton, EmptyState } from '../components/ui'
import type { FinancialOperation, WalletLedgerEntry, TimePackage } from '../api/gamingBillingApi'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi, type PaymentMethod } from '../api/gamingBillingApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Alert, Button, Input, Select } from '../components/ui'
import { useFinancialCommand } from './useFinancialCommand'
export function GamingWalletPanel({ customerId }: { customerId: string }) {
  const actor = useAuthStore(s => s.user), manage = hasCapability(actor, 'GAMING_PAYMENT_RECORD')
  const wallet = useQuery({ queryKey: ['gaming-wallet', customerId], queryFn: () => gamingBillingApi.wallet(customerId), refetchInterval: 5000 })
  const [finishId, setFinishId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const ledger = usePagedQuery(['gaming-wallet', customerId, 'ledger'], (page, size) => gamingBillingApi.walletHistory<WalletLedgerEntry>(customerId, 'ledger', page, size), 10, historyOpen)
  const transactions = usePagedQuery(['gaming-wallet', customerId, 'transactions'], (page, size) => gamingBillingApi.walletHistory<FinancialOperation>(customerId, 'transactions', page, size), 10, historyOpen)
  const packages = usePagedQuery(['gaming-wallet', customerId, 'packages'], (page, size) => gamingBillingApi.walletHistory<TimePackage>(customerId, 'packages', page, size), 10, historyOpen)
  const refundable = useQuery({ queryKey: ['gaming-wallet', customerId, 'refundable'], queryFn: () => gamingBillingApi.refundableWalletPayments(customerId), enabled: hasCapability(actor, 'GAMING_FINANCE_MANAGE') })
  const board = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: manage })
  const tariffs = useQuery({ queryKey: ['gaming-billing', 'tariffs'], queryFn: gamingBillingApi.tariffs, enabled: manage })
  const [action, setAction] = useState<'topups' | 'packages' | 'adjustments' | 'refunds'>('topups'), [resourceId, setResourceId] = useState('')
  const [amount, setAmount] = useState(''), [method, setMethod] = useState<PaymentMethod>('CASH'), [reference, setReference] = useState(''), [reason, setReason] = useState(''), [tariffId, setTariff] = useState(''), [paymentId, setPayment] = useState('')
  const command = useFinancialCommand(), tariff = tariffs.data?.find(t => t.id === tariffId)
  return <section className="ui-card"><h3>Prepaid kredit i paketi</h3>
    {wallet.isLoading && <p>Ucitavanje kredita...</p>}{wallet.error && <Alert tone="danger">Kredit nije dostupan.</Alert>}
    {wallet.data && <><p><strong>Raspolozivo: {wallet.data.balance} RSD</strong></p><ul>{wallet.data.packages.map(p => <li key={p.id}>{p.remaining_minutes} / {p.minutes} min - rok {p.expires_at ?? 'bez isteka'}</li>)}</ul>
      <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Istorija kredita i vremena</summary>
        {ledger.isLoading && <Skeleton lines={3} />}{ledger.error && <Alert tone="danger">Istorija kredita nije dostupna. <Button onClick={() => void ledger.refetch()}>Osveži</Button></Alert>}
        {ledger.data && !ledger.data.content.length && <EmptyState title="Nema zapisa kredita" />}
        <ul>{ledger.data?.content.map(l => <li key={l.id}>{l.created_at} - {l.kind}: {l.amount} RSD / {l.minutes} min {l.reason}</li>)}</ul>
        {ledger.data && <Pagination label="Stranice kredita" page={ledger.page} onPageChange={ledger.setPage} totalPages={ledger.data.totalPages} totalElements={ledger.data.totalElements} pageSize={10} loading={ledger.isFetching} />}
        <h4>Uplate, refundacije i korekcije</h4>
        {transactions.isLoading && <Skeleton lines={3} />}{transactions.error && <Alert tone="danger">Transakcije nisu dostupne. <Button onClick={() => void transactions.refetch()}>Osveži</Button></Alert>}
        {transactions.data && !transactions.data.content.length && <EmptyState title="Nema transakcija" />}
        <ul>{transactions.data?.content.map(t => <li key={t.id}>{t.created_at} - {t.kind}: {t.amount} RSD {t.reason}</li>)}</ul>
        {transactions.data && <Pagination label="Stranice transakcija" page={transactions.page} onPageChange={transactions.setPage} totalPages={transactions.data.totalPages} totalElements={transactions.data.totalElements} pageSize={10} loading={transactions.isFetching} />}
        <h4>Istorija vremenskih paketa</h4>
        {packages.isLoading && <Skeleton lines={3} />}{packages.error && <Alert tone="danger">Paketi nisu dostupni. <Button onClick={() => void packages.refetch()}>Osvezi</Button></Alert>}
        {packages.data && !packages.data.content.length && <EmptyState title="Nema paketa" />}
        <ul>{packages.data?.content.map(p => <li key={p.id}>{p.remaining_minutes} / {p.minutes} min - rok {p.expires_at ?? 'bez isteka'}</li>)}</ul>
        {packages.data && <Pagination label="Stranice vremenskih paketa" page={packages.page} onPageChange={packages.setPage} totalPages={packages.data.totalPages} totalElements={packages.data.totalElements} pageSize={10} loading={packages.isFetching} />}
      </details>
    </>}
    {wallet.data?.meteredSessions?.map(s => <article key={s.id} className="ui-card"><strong>{s.resource_name} - {s.status === 'ACTIVE' ? 'Prepaid igranje' : 'Zavrseno'}</strong><p>{s.billed_seconds} s ? {s.charged_amount} RSD</p>{s.status === 'ACTIVE' && <><p>Procenjeno preostalo: {Math.max(0, Math.floor((Date.parse(s.ends_at) - Date.parse(wallet.data!.serverTime!)) / 60000))} min</p>{Number(wallet.data?.balance) < 100 && <Alert tone="danger">Nizak kredit. Dopunite nalog.</Alert>}{actor?.id === customerId && <Button disabled={command.locked} onClick={() => setFinishId(s.id)}>Zavrsi igranje</Button>}</>}</article>)}
    <ConfirmDialog open={!!finishId} title="Zavrsi igranje" description="Preostali kredit ostaje na nalogu. Naplacuje se potroseno vreme." confirmLabel="Zavrsi igranje" onClose={() => setFinishId(null)} onConfirm={async () => { if(finishId) { await gamingSessionApi.finish(finishId); await wallet.refetch() } }} />
    {manage && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); const payment = { method, amount: action === 'packages' ? String(tariff?.price ?? '') : amount, reference }; const body = action === 'packages' ? { resourceId, tariffId, tariffVersion: tariff?.version, payment } : action === 'adjustments' ? { resourceId, amount, reason } : action === 'refunds' ? { paymentId, amount, reason } : { resourceId, payment, reason }; void command.run(key => gamingBillingApi.walletChange(customerId, action, body, key)) }}>
      {command.feedback}{action === 'refunds' && refundable.error && <Alert tone="danger">Uplate za refundaciju nisu dostupne. <Button type="button" onClick={() => void refundable.refetch()}>Osvezi</Button></Alert>}<fieldset disabled={command.locked}><legend>Evidentiranje operacije</legend>
        <label>Operacija<Select value={action} onChange={e => setAction(e.target.value as typeof action)}><option value="topups">Dopuna kredita</option><option value="packages">Kupovina paketa vremena</option>{hasCapability(actor, 'GAMING_FINANCE_MANAGE') && <><option value="adjustments">Privilegovana korekcija kredita</option><option value="refunds">Refundacija neiskoriscene dopune / paketa</option></>}</Select></label>
        <label>Stanica / mesto naplate<Select required={action !== 'refunds'} value={resourceId} onChange={e => setResourceId(e.target.value)}><option value="">Izaberite dodeljenu stanicu</option>{board.data?.stations.map(s => <option key={s.resourceId} value={s.resourceId}>{s.resourceName}</option>)}</Select></label>
        {action === 'refunds' && <label>Originalna uplata<Select required value={paymentId} onChange={e => setPayment(e.target.value)}><option value="">Izaberite uplatu</option>{refundable.data?.map(t => <option key={t.id} value={t.id}>{t.kind} - {t.amount} RSD - {t.created_at}</option>)}</Select></label>}
        {action === 'packages' ? <label>Tarifa paketa<Select required value={tariffId} onChange={e => setTariff(e.target.value)}><option value="">Izaberite paket</option>{tariffs.data?.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} / {t.minutes} min / {t.price} RSD</option>)}</Select></label> : <label>Iznos RSD<Input required type="number" step="0.01" min={action === 'adjustments' ? undefined : '0.01'} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
        {['topups', 'packages'].includes(action) && <><label>Primljena uplata<Select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="CASH">Gotovina</option><option value="EXTERNAL_POS">Spoljni POS</option></Select></label>{method === 'EXTERNAL_POS' && <label>POS potvrda<Input required value={reference} onChange={e => setReference(e.target.value)} /></label>}</>}
        <label>Razlog / napomena<Input required={action !== 'packages'} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <p>Refundacija paketa je moguca samo u celosti pre prve potrosnje. G-Manager vodi internu evidenciju; karticno placanje/refundaciju izvrsava spoljni POS.</p>
        <Button type="submit" loading={command.busy}>Potvrdi finansijsku operaciju</Button>
      </fieldset>
    </form>}
  </section>
}
