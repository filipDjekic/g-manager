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
  const wallet = useQuery({ queryKey: ['gaming-wallet', customerId], queryFn: () => gamingBillingApi.wallet(customerId) })
  const board = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: manage })
  const tariffs = useQuery({ queryKey: ['gaming-billing', 'tariffs'], queryFn: gamingBillingApi.tariffs, enabled: manage })
  const [action, setAction] = useState<'topups' | 'packages' | 'adjustments' | 'refunds'>('topups'), [resourceId, setResourceId] = useState('')
  const [amount, setAmount] = useState(''), [method, setMethod] = useState<PaymentMethod>('CASH'), [reference, setReference] = useState(''), [reason, setReason] = useState(''), [tariffId, setTariff] = useState(''), [paymentId, setPayment] = useState('')
  const command = useFinancialCommand(), tariff = tariffs.data?.find(t => t.id === tariffId)
  return <section className="ui-card"><h3>Prepaid kredit i paketi</h3>
    {wallet.isLoading && <p>Ucitavanje kredita...</p>}{wallet.error && <Alert tone="danger">Kredit nije dostupan.</Alert>}
    {wallet.data && <><p><strong>Raspolozivo: {wallet.data.balance} RSD</strong></p><ul>{wallet.data.packages.map(p => <li key={p.id}>{p.remaining_minutes} / {p.minutes} min - rok {p.expires_at ?? 'bez isteka'}</li>)}</ul>
      <details><summary>Istorija kredita i vremena</summary><ul>{wallet.data.ledger.map(l => <li key={l.id}>{l.created_at} - {l.kind}: {l.amount} RSD / {l.minutes} min {l.reason}</li>)}</ul></details>
    </>}
    {manage && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); const payment = { method, amount: action === 'packages' ? String(tariff?.price ?? '') : amount, reference }; const body = action === 'packages' ? { resourceId, tariffId, tariffVersion: tariff?.version, payment } : action === 'adjustments' ? { resourceId, amount, reason } : action === 'refunds' ? { paymentId, amount, reason } : { resourceId, payment, reason }; void command.run(key => gamingBillingApi.walletChange(customerId, action, body, key)) }}>
      {command.feedback}<fieldset disabled={command.locked}><legend>Evidentiranje operacije</legend>
        <label>Operacija<Select value={action} onChange={e => setAction(e.target.value as typeof action)}><option value="topups">Dopuna kredita</option><option value="packages">Kupovina paketa vremena</option>{hasCapability(actor, 'GAMING_FINANCE_MANAGE') && <><option value="adjustments">Privilegovana korekcija kredita</option><option value="refunds">Refundacija neiskoriscene dopune / paketa</option></>}</Select></label>
        <label>Stanica / mesto naplate<Select required={action !== 'refunds'} value={resourceId} onChange={e => setResourceId(e.target.value)}><option value="">Izaberite dodeljenu stanicu</option>{board.data?.stations.map(s => <option key={s.resourceId} value={s.resourceId}>{s.resourceName}</option>)}</Select></label>
        {action === 'refunds' && <label>Originalna uplata<Select required value={paymentId} onChange={e => setPayment(e.target.value)}><option value="">Izaberite uplatu</option>{wallet.data?.transactions.filter(t => ['CREDIT_TOPUP', 'PACKAGE_SALE'].includes(t.kind)).map(t => <option key={t.id} value={t.id}>{t.kind} - {t.amount} RSD - {t.created_at}</option>)}</Select></label>}
        {action === 'packages' ? <label>Tarifa paketa<Select required value={tariffId} onChange={e => setTariff(e.target.value)}><option value="">Izaberite paket</option>{tariffs.data?.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} / {t.minutes} min / {t.price} RSD</option>)}</Select></label> : <label>Iznos RSD<Input required type="number" step="0.01" min={action === 'adjustments' ? undefined : '0.01'} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
        {['topups', 'packages'].includes(action) && <><label>Primljena uplata<Select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="CASH">Gotovina</option><option value="EXTERNAL_POS">Spoljni POS</option></Select></label>{method === 'EXTERNAL_POS' && <label>POS potvrda<Input required value={reference} onChange={e => setReference(e.target.value)} /></label>}</>}
        <label>Razlog / napomena<Input required={action !== 'packages'} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <p>Refundacija paketa je moguca samo u celosti pre prve potrosnje. G-Manager vodi internu evidenciju; karticno placanje/refundaciju izvrsava spoljni POS.</p>
        <Button type="submit" loading={command.busy}>Potvrdi finansijsku operaciju</Button>
      </fieldset>
    </form>}
  </section>
}
