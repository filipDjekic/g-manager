import type { PaymentMethod } from '../api/gamingBillingApi'
import type { GamingPurchaseModel } from './useGamingPurchase'
import { apiErrorMessage } from '../api/client'
import { Alert, Input, Select } from '../components/ui'
import { useServerNow } from './useServerNow'

export function PurchaseFields({ model: m, disabled }: { model: GamingPurchaseModel; disabled: boolean }) {
  const now = useServerNow(m.wallet.data?.serverTime)
  return <fieldset disabled={disabled} className="ui-form-grid"><legend>Tarifa i potvrda naplate</legend>
    <label>Gaming tarifa<Select required={m.method !== 'TIME_PACKAGE'} value={m.tariffId} onChange={e => m.setChosen(e.target.value)}><option value="">Izaberite tarifu</option>{m.tariffs.data?.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} - {t.minutes} min / {t.price} RSD</option>)}</Select></label>
    {m.method !== 'TIME_PACKAGE' && m.tariffs.error && <Alert tone="danger">Tarife nisu dostupne.</Alert>}
    {m.method !== 'TIME_PACKAGE' && !m.tariffs.isLoading && !m.tariffs.data?.some(t => t.active) && <Alert tone="warning">OWNER/ADMIN mora prvo podesiti aktivne tarife u Rad igraonice.</Alert>}
    <label>Popust (%)<Input type="number" min="0" max="100" step="0.01" value={m.discount} onChange={e => m.setDiscount(e.target.value)} /></label>
    <label>Razlog popusta / korekcije<Input value={m.reason} onChange={e => m.setReason(e.target.value)} /></label>
    {m.quote.error && <Alert tone="danger">{apiErrorMessage(m.quote.error, 'Proverite trajanje i kategoriju tarife.')}</Alert>}
    {m.quote.data && <p role="status"><strong>{m.method === 'TIME_PACKAGE' ? `Potrosnja paketa: ${m.quote.data.minutes} min. Nova uplata: 0 RSD` : `Za naplatu: ${m.quote.data.total} RSD`}</strong> (pre popusta {m.quote.data.gross} RSD). Cena se proverava pri potvrdi.</p>}
    <label>Nacin placanja<Select value={m.method} onChange={e => m.setMethod(e.target.value as PaymentMethod)}><option value="CASH">Gotovina</option><option value="EXTERNAL_POS">Evidencija spoljnog POS placanja</option>{m.wallet.data && <><option value="WALLET">Prepaid kredit ({m.wallet.data.balance} RSD)</option><option value="TIME_PACKAGE">Kupljen paket vremena</option></>}</Select></label>
    {m.method === 'TIME_PACKAGE' ? <label>Paket vremena<Select required value={m.packageId} onChange={e => m.setPackageId(e.target.value)}><option value="">Izaberite paket</option>{m.wallet.data?.packages.filter(p => p.remaining_minutes > 0 && (!p.expires_at || Date.parse(p.expires_at) > now)).map(p => <option key={p.id} value={p.id}>{p.remaining_minutes} min - {p.expires_at ?? 'Bez isteka'}</option>)}</Select></label> : <label>Evidentirani iznos (RSD)<Input required type="number" min="0" step="0.01" value={m.paymentAmount} onChange={e => m.setAmount(e.target.value)} /></label>}
    {m.method === 'EXTERNAL_POS' && <label>Potvrda / referenca spoljnog POS terminala<Input required maxLength={160} value={m.reference} onChange={e => m.setReference(e.target.value)} /></label>}
    <p className="search-help">Potvrdom evidentirate primljenu uplatu. POS obradu obavlja spoljni terminal. Potvrda G-Managera je interna i nije fiskalni racun. Nepotroseno vreme se ne refundira automatski.</p>
  </fieldset>
}
