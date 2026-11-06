import type { GamingPurchaseModel } from './useGamingPurchase'
import { Alert, Button, Input, Skeleton } from '../components/ui'
import { remaining } from './presentation'
import './gaming-time.css'

export function PurchaseFields({ model: m, disabled }: { model: GamingPurchaseModel; disabled: boolean }) {
  return <fieldset disabled={disabled} className="ui-form-grid gaming-time-fields" aria-label="Dodaj vreme">
    {m.wallet.isLoading && <Skeleton lines={1} />}
    {m.wallet.error && <Alert tone="danger">Raspoloživo vreme nije dostupno. <Button type="button" onClick={() => void m.wallet.refetch()}>Osveži</Button></Alert>}
    {m.wallet.data && <p>Raspoloživo vreme: <strong>{remaining(m.wallet.data.balanceSeconds)}</strong></p>}
    <label>Dodaj minute<Input required type="number" min={30} max={5256000} step={1} value={Number.isNaN(m.minutes) ? '' : m.minutes} onChange={e => m.setMinutes(e.target.valueAsNumber)} /></label>
    {m.price.isLoading && <Skeleton lines={1} />}
    {m.price.error && <Alert tone="danger">Cena nije dostupna. <Button type="button" onClick={() => void m.price.refetch()}>Osveži cenu</Button></Alert>}
    {m.price.data?.pricePerMinute === null && <Alert tone="warning">OWNER/ADMIN treba da podesi cenu gaming minuta u podešavanjima.</Alert>}
    <p>Cena: <strong>{m.amount ? `${m.amount} RSD` : '—'}</strong></p>
    {m.wallet.data && <p>Novo stanje vremena: <strong>{remaining(m.wallet.data.balanceSeconds + (m.validMinutes ? m.minutes * 60 : 0))}</strong></p>}
  </fieldset>
}
