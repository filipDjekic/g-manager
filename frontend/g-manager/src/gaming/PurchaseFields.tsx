import type { GamingPurchaseModel } from './useGamingPurchase'
import { Alert, Button, Input, Select, Skeleton } from '../components/ui'
import { remaining } from './presentation'
import './gaming-time.css'

export function PurchaseFields({ model: m, disabled }: { model: GamingPurchaseModel; disabled: boolean }) {
  return <fieldset disabled={disabled} className="ui-form-grid gaming-time-fields" aria-label="Dodaj vreme">
    {m.account.isLoading && <Skeleton lines={1} />}
    {m.account.error && <Alert tone="danger">Raspoloživo vreme nije dostupno. <Button type="button" onClick={() => void m.account.refetch()}>Osveži</Button></Alert>}
    {m.account.data && <p>Raspoloživo vreme: <strong>{remaining(m.account.data.balanceSeconds)}</strong></p>}
    <label>Dodaj minute<Input required type="number" min={30} max={5256000} step={1} value={Number.isNaN(m.minutes) ? '' : m.minutes} onChange={e => m.setMinutes(e.target.valueAsNumber)} /></label>
    {m.price.isLoading && <Skeleton lines={1} />}
    {m.price.error && <Alert tone="danger">Cena nije dostupna. <Button type="button" onClick={() => void m.price.refetch()}>Osveži cenu</Button></Alert>}
    {m.price.data?.pricePerMinute === null && <Alert tone="warning">OWNER/ADMIN treba da podesi cenu gaming minuta u podešavanjima.</Alert>}
    <p>Cena: <strong>{m.amount ? `${m.amount} RSD` : '—'}</strong></p>
    <label>Način evidentiranja uplate<Select value={m.method} onChange={e => m.setMethod(e.target.value === 'EXTERNAL_POS' ? 'EXTERNAL_POS' : 'CASH')}>
      <option value="CASH">Gotovina</option><option value="EXTERNAL_POS">Spoljni POS</option>
    </Select></label>
    {m.method === 'EXTERNAL_POS' && <label>POS referenca<Input maxLength={160} value={m.reference} onChange={e => m.setReference(e.target.value)} /></label>}
    {m.account.data && <p>Novo stanje vremena: <strong>{remaining(m.account.data.balanceSeconds + (m.validMinutes ? m.minutes * 60 : 0))}</strong></p>}
  </fieldset>
}
