import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination, Skeleton, EmptyState, ErrorState } from '../components/ui'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi, type BillingPolicy, type Tariff } from '../api/gamingBillingApi'
import { catalogApi } from '../api/catalogApi'
import { Alert, Button, Input, Select } from '../components/ui'
import { useFinancialCommand } from '../gaming/useFinancialCommand'
const fresh = { name: '', serviceId: '', minutes: 60, price: '', active: true, packageValidityDays: 0, version: 0, validFrom: '', validUntil: '' }
export function GamingTariffSettings() {
  const tariffs = usePagedQuery(['gaming-billing', 'tariffs', 'page'], gamingBillingApi.tariffPage)
  const policy = useQuery({ queryKey: ['gaming-billing', 'policy'], queryFn: gamingBillingApi.policy })
  const services = useQuery({ queryKey: ['gaming-billing', 'services'], queryFn: () => catalogApi.list({ page: 0, size: 100, type: 'SERVICE' }) })
  const [editing, setEditing] = useState<Partial<Tariff> & typeof fresh>(fresh), command = useFinancialCommand(() => setEditing(fresh))
  return <section className="ui-card"><h2>Gaming tarife i poslovna pravila</h2>
    {(tariffs.error || policy.error) && <Alert tone="danger">Podesavanja nisu dostupna.</Alert>}
    <p>Kategorija racunara je postojeca kataloska usluga resursa (npr. Standard / VIP). Vreme se kupuje u celim blokovima odabrane tarife. Produzenja koriste novu potvrdu cene; stari obracuni cuvaju snimak. Nepotroseno vreme nema automatsku refundaciju.</p>
    {tariffs.error && <ErrorState message="Tarife nisu dostupne." action={<Button onClick={() => void tariffs.refetch()}>Osvezi</Button>} />}
    {tariffs.isLoading && <Skeleton lines={3} />}{tariffs.data && !tariffs.data.totalElements && <EmptyState title="Nema tarifa" />}
    <ul>{tariffs.data?.content.map(t => <li key={t.id}>{t.name}: {t.minutes} min / {t.price} RSD - {t.active ? 'aktivna' : 'neaktivna'} <Button type="button" variant="secondary" disabled={command.locked} onClick={() => setEditing({ ...t, price: String(t.price), serviceId: t.serviceId ?? '', validFrom: t.validFrom ?? '', validUntil: t.validUntil ?? '' })}>Izmeni</Button></li>)}</ul>
    {tariffs.data && <Pagination page={tariffs.page} onPageChange={tariffs.setPage} totalPages={tariffs.data.totalPages} totalElements={tariffs.data.totalElements} pageSize={10} loading={tariffs.isFetching} />}
    <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); const payload = { ...editing, serviceId: editing.serviceId || undefined, validFrom: editing.validFrom || undefined, validUntil: editing.validUntil || undefined }; void command.run(key => gamingBillingApi.saveTariff(payload, key)) }}>
      {command.feedback}<fieldset disabled={command.locked}><legend>{editing.id ? 'Izmena tarife' : 'Nova tarifa'}</legend>
        <label>Naziv<Input required maxLength={120} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
        <label>Kategorija / usluga<Select value={editing.serviceId} onChange={e => setEditing({ ...editing, serviceId: e.target.value })}><option value="">Sve kategorije</option>{services.data?.content.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
        <label>Minuta po bloku<Input required type="number" min={1} max={1440} value={editing.minutes} onChange={e => setEditing({ ...editing, minutes: Number(e.target.value) })} /></label>
        <label>Cena RSD<Input required type="number" min="0.01" step="0.01" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></label>
        <label>Vazenje kupljenog paketa (dana, 0 bez isteka)<Input type="number" min={0} max={3650} value={editing.packageValidityDays} onChange={e => setEditing({ ...editing, packageValidityDays: Number(e.target.value) })} /></label>
        <label>Promocija od (ISO vreme sa zonom)<Input placeholder="2026-11-03T09:00:00+01:00" value={editing.validFrom} onChange={e => setEditing({ ...editing, validFrom: e.target.value })} /></label>
        <label>Promocija do (ISO vreme sa zonom)<Input placeholder="2026-12-01T00:00:00+01:00" value={editing.validUntil} onChange={e => setEditing({ ...editing, validUntil: e.target.value })} /></label>
        <label><Input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Aktivna tarifa</label>
        <Button type="submit">Sacuvaj tarifu</Button>{editing.id && <Button type="button" variant="secondary" onClick={() => setEditing(fresh)}>Nova tarifa</Button>}
      </fieldset>
    </form>
    <MeteredPolicyEditor />
    {policy.data && <PolicyEditor key={policy.data.version} initial={policy.data} />}
  </section>
}
function PolicyEditor({ initial }: { initial: BillingPolicy }) {
  const [p, setPolicy] = useState(initial), command = useFinancialCommand()
  return <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); void command.run(() => gamingBillingApi.savePolicy(p)) }}>
    {command.feedback}<fieldset disabled={command.locked}><legend>Pravila naplate</legend>
      {(['allowPartialPayment', 'allowDebt', 'allowRefunds'] as const).map((k, i) => <label key={k}><Input type="checkbox" checked={p[k]} onChange={e => setPolicy({ ...p, [k]: e.target.checked })} />{['Delimicne uplate (zahteva dozvoljen dug)', 'Dozvoli neplacene obaveze', 'Dozvoli refundacije uz OWNER/ADMIN ovlascenje'][i]}</label>)}
      <label>Minimalno minuta<Input required type="number" min={1} max={1440} value={p.minimumMinutes} onChange={e => setPolicy({ ...p, minimumMinutes: Number(e.target.value) })} /></label>
      <label>Maksimalno minuta po sesiji<Input required type="number" min={1} max={1440} value={p.maximumMinutes} onChange={e => setPolicy({ ...p, maximumMinutes: Number(e.target.value) })} /></label>
      <label>Maksimalni popust zaposlenog (%)<Input required type="number" min={0} max={100} step="0.01" value={p.employeeDiscountLimit} onChange={e => setPolicy({ ...p, employeeDiscountLimit: e.target.value })} /></label>
      <Button type="submit">Potvrdi poslovna pravila</Button>
    </fieldset>
  </form>
}

function MeteredPolicyEditor() {
  const query = useQuery({ queryKey: ['gaming-billing', 'metered-policy'], queryFn: gamingBillingApi.meteredPolicy })
  const [draft, setDraft] = useState<import('../api/gamingBillingApi').MeteredPolicy>()
  const command = useFinancialCommand(), p = draft ?? query.data
  if (!p) return null
  return <form onSubmit={e => { e.preventDefault(); void command.run(() => gamingBillingApi.saveMeteredPolicy(p)) }}><fieldset disabled={command.locked}><legend>Rezimi naplate</legend>{command.feedback}
    <label><Input type="checkbox" checked={p.allowFixed} onChange={e => setDraft({ ...p, allowFixed: e.target.checked })} /> Unapred kupljeno vreme</label>
    <label><Input type="checkbox" checked={p.allowMetered} onChange={e => setDraft({ ...p, allowMetered: e.target.checked })} /> Prepaid po stvarnom vremenu</label>
    <label>Podrazumevani rezim<Select value={p.defaultMode} onChange={e => setDraft({ ...p, defaultMode: e.target.value as typeof p.defaultMode })}><option value="FIXED_DURATION">Unapred kupljeno vreme</option><option value="PREPAID_METERED">Prepaid po stvarnom vremenu</option></Select></label>
    <label>Obracunska jedinica (sekunde)<Input type="number" required min={1} max={3600} value={p.billingUnitSeconds} onChange={e => setDraft({ ...p, billingUnitSeconds: Number(e.target.value) })} /></label><p>Zapoceta jedinica naplacuje se u celosti. Podrazumevano: 1 sekunda.</p><Button type="submit">Sacuvaj rezime naplate</Button>
  </fieldset></form>
}
