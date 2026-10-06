import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { waitlistApi } from '../api/waitlistApi'
import { StartSessionDialog } from '../gaming/StartSessionDialog'
import { GamingVisitList } from '../gaming/GamingVisitList'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, Drawer, EmptyState, ErrorState, Modal, Skeleton, TableShell } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { useListUrlState } from '../lists/useListUrlState'
import { Link } from 'react-router-dom'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'

const defaults = { search: '', active: '', page: '0', customerId: '' }
const allowed = ['search', 'active', 'page', 'customerId'] as const
const money = new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' })

export function CustomersPage() {
  const user = useAuthStore((state) => state.user)
  const canManageCrm = hasCapability(user, 'CUSTOMER_CRM_MANAGE')
  const detailOpener = useRef<HTMLButtonElement>(null)
  const url = useListUrlState(defaults, allowed)
  const filters = useMemo(() => ({
    search: url.state.search || undefined,
    active: url.state.active === '' ? undefined : url.state.active === 'true',
    page: Math.max(0, Number(url.state.page) || 0), size: 20,
  }), [url.state.active, url.state.page, url.state.search])
  const listKey = `${url.state.search}|${url.state.active}|${url.state.page}`
  const list = useQuery({ queryKey: queryKeys.customers(listKey), queryFn: () => customerApi.list(filters) })
  const selectedId = url.state.customerId
  const detail = useQuery({ queryKey: queryKeys.customerDetail(selectedId), queryFn: () => customerApi.detail(selectedId), enabled: Boolean(selectedId) })
  const [crmSearch, setCrmSearch] = useState('')
  const [note, setNote] = useState('')
  const [tag, setTag] = useState('')
  const [crmError, setCrmError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerError, setCustomerError] = useState('')
  const [activation, setActivation] = useState<{ secret: string; expiresAt: string } | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [editing, setEditing] = useState<{name:string;email:string}|null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [busy, setBusy] = useState(false)
  const visits = useQuery({queryKey:['gaming-visits','customer',selectedId],queryFn:()=>gamingSessionApi.customerVisits(selectedId),
    enabled:!!selectedId && hasCapability(user,'GAMING_SESSION_READ')})
  const queue = useQuery({queryKey:['waitlist','customer',selectedId],queryFn:()=>waitlistApi.operational({customerId:selectedId,page:0,size:5}),
    enabled:!!selectedId && hasCapability(user,'RESERVATION_READ_ALL')})
  const crm = useQuery({ queryKey: ['customers', 'crm', selectedId, crmSearch],
    queryFn: () => customerApi.crm(selectedId, crmSearch || undefined),
    enabled: Boolean(selectedId) && canManageCrm })
  const close = () => url.set({ customerId: '' })

  async function createCustomer(event: FormEvent) {
    event.preventDefault(); if(busy)return;setBusy(true);setCustomerError('')
    try {
      const created = await customerApi.create({ name: customerName.trim(), email: customerEmail.trim() })
      setActivation({ secret: created.activationSecret, expiresAt: created.activationExpiresAt })
      setCustomerName(''); setCustomerEmail(''); await list.refetch()
    } catch (cause) { setCustomerError(apiErrorMessage(cause, 'Klijenta nije moguće kreirati.')) }
    finally {setBusy(false)}
  }

  async function editCustomer(event:FormEvent) {
    event.preventDefault();if (!detail.data || !editing || busy) return
    setBusy(true);setCustomerError('')
    try {
      await customerApi.update(detail.data.customer.id, { name:editing.name.trim(), email:editing.email.trim(), version: detail.data.customer.version })
      setEditing(null)
      await Promise.all([detail.refetch(), list.refetch()])
    } catch (cause) { setCustomerError(apiErrorMessage(cause, 'Klijenta nije moguće izmeniti.')) }
    finally {setBusy(false)}
  }

  async function deactivateCustomer() {
    if (!detail.data || busy) return
    setBusy(true);setCustomerError('')
    try { await customerApi.deactivate(detail.data.customer.id); setDeactivating(false);close(); await list.refetch() }
    catch (cause) { setCustomerError(apiErrorMessage(cause, 'Klijenta nije moguće deaktivirati.')) }
    finally {setBusy(false)}
  }

  async function addNote(event: FormEvent) {
    event.preventDefault(); if (!selectedId || !note.trim()) return
    try { await customerApi.addCrmNote(selectedId, note.trim()); setNote(''); setCrmError(''); await crm.refetch() }
    catch (cause) { setCrmError(apiErrorMessage(cause, 'Belešku nije moguće sačuvati.')) }
  }
  async function editNote(item: NonNullable<typeof crm.data>['notes'][number]) {
    const body = window.prompt('Izmenite CRM belešku', item.body)?.trim(); if (!body || !selectedId) return
    try { await customerApi.updateCrmNote(selectedId, item.id, body, item.version); await crm.refetch() }
    catch (cause) { setCrmError(apiErrorMessage(cause, 'Belešku nije moguće izmeniti.')) }
  }
  async function removeNote(item: NonNullable<typeof crm.data>['notes'][number]) {
    if (!selectedId || !window.confirm('Obrisati CRM belešku?')) return
    try { await customerApi.deleteCrmNote(selectedId, item.id, item.version); await crm.refetch() }
    catch (cause) { setCrmError(apiErrorMessage(cause, 'Belešku nije moguće obrisati.')) }
  }
  async function addTag(event: FormEvent) {
    event.preventDefault(); if (!selectedId || !tag.trim()) return
    try { await customerApi.addCrmTag(selectedId, tag.trim()); setTag(''); setCrmError(''); await crm.refetch() }
    catch (cause) { setCrmError(apiErrorMessage(cause, 'Tag nije moguće sačuvati.')) }
  }
  async function removeTag(name: string) {
    if (!selectedId || !crm.data) return
    try { await customerApi.removeCrmTag(selectedId, name, crm.data.version); await crm.refetch() }
    catch (cause) { setCrmError(apiErrorMessage(cause, 'Tag nije moguće ukloniti.')) }
  }

  return <main className="workspace customer-workspace">
    <div className="page-heading"><div><p className="eyebrow">Ljudi</p><h1>Klijenti</h1></div>
      {hasCapability(user, 'CUSTOMER_CREATE') && <Button onClick={() => { setActivation(null); setCreateOpen(true) }}>
        Novi klijent</Button>}</div>
    {customerError && <p className="error-banner" role="alert">{customerError}</p>}
    <div className="filter-bar customer-filters">
      <label>Pretraga<input value={url.state.search} placeholder="Ime ili email"
        onChange={(event) => url.set({ search: event.target.value, page: '0' }, true)} /></label>
      <label>Status<select value={url.state.active} onChange={(event) => url.set({ active: event.target.value, page: '0' })}>
        <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
      </select></label>
    </div>
    <SavedViewBar resource="CUSTOMERS" query={url.queryObject} apply={url.apply} />
    {list.isLoading ? <Skeleton lines={6} label="Učitavanje klijenata" /> : list.error ?
      <ErrorState message={apiErrorMessage(list.error, 'Klijente nije moguće učitati.')} action={<Button onClick={() => list.refetch()}>Pokušaj ponovo</Button>} /> :
      !list.data?.content.length ? <EmptyState title="Nema klijenata" description="Promenite pretragu ili status." /> :
      <TableShell label="Lista klijenata"><table className="data-table customer-table responsive-table"><thead><tr><th>Klijent</th><th>Završeni termini</th>
        <th>Prihod završenih narudžbina</th><th>Poslednja aktivnost</th><th><span className="sr-only">Akcije</span></th></tr></thead>
        <tbody>{list.data.content.map((customer) => <tr key={customer.id}><td data-label="Klijent"><strong>{customer.name}</strong><small>{customer.email}</small></td>
          <td data-label="Završeni termini">{customer.completedAppointmentCount}</td><td data-label="Prihod">{money.format(customer.completedOrderRevenue)}</td>
          <td data-label="Poslednja aktivnost">{customer.lastActivityAt ? formatBusinessDateTime(customer.lastActivityAt) : 'Nema aktivnosti'}</td>
          <td data-label="Akcije"><Button variant="secondary" onClick={(event) => { detailOpener.current = event.currentTarget; url.set({ customerId: customer.id }) }}>Detalji</Button></td></tr>)}</tbody></table></TableShell>}
    <div className="pagination"><button disabled={filters.page === 0} onClick={() => url.set({ page: String(filters.page - 1) })}>Prethodna</button>
      <span>Strana {filters.page + 1} od {Math.max(list.data?.totalPages ?? 1, 1)}</span>
      <button disabled={!list.data || filters.page + 1 >= list.data.totalPages} onClick={() => url.set({ page: String(filters.page + 1) })}>Sledeća</button></div>
    <Drawer size="wide" open={Boolean(selectedId) && !startOpen && !editing && !deactivating} title={detail.data?.customer.name ?? 'Detalji klijenta'} onClose={close} returnFocusRef={detailOpener}>
      {detail.isLoading ? <Skeleton lines={6} label="Učitavanje detalja klijenta" /> : detail.error ?
        <ErrorState message={apiErrorMessage(detail.error, 'Detalje klijenta nije moguće učitati.')} action={<Button onClick={() => detail.refetch()}>Pokušaj ponovo</Button>} /> : detail.data && <div className="customer-detail">
          {customerError && <p className="error-banner" role="alert">{customerError}</p>}
          <p>{detail.data.customer.email}</p><Badge tone={detail.data.customer.active?'success':'neutral'}>{detail.data.customer.active ? 'Aktivan nalog' : 'Neaktivan nalog'}</Badge>
          <p><strong>Registrovan:</strong> {formatBusinessDateTime(detail.data.customer.registeredAt)}</p>
          <div className="form-actions">
            {hasCapability(user, 'GAMING_SESSION_START') && <Button disabled={!detail.data.customer.active || !!visits.data?.some(v=>v.status==='ACTIVE')}
              onClick={() => setStartOpen(true)}>Pokreni gaming sesiju</Button>}
            {hasCapability(user, 'CUSTOMER_UPDATE_LIMITED') && <Button variant="secondary"
              onClick={() => {setCustomerError('');setEditing({name:detail.data!.customer.name,email:detail.data!.customer.email})}}>Izmeni podatke</Button>}
            {detail.data.customer.active && hasCapability(user, 'CUSTOMER_DEACTIVATE') &&
              <Button variant="danger" onClick={() => {setCustomerError('');setDeactivating(true)}}>Deaktiviraj</Button>}
          </div>
          <div className="customer-kpis"><article><strong>{detail.data.customer.completedAppointmentCount}</strong><span>Završeni termini</span></article>
            <article><strong>{detail.data.customer.completedOrderCount}</strong><span>Završene narudžbine</span></article>
            <article><strong>{money.format(detail.data.customer.completedOrderRevenue)}</strong><span>Ostvaren prihod</span></article></div>
          {hasCapability(user,'GAMING_SESSION_READ') && <section><h3>Gaming sesije</h3>
            {visits.isLoading?<Skeleton lines={3}/>:visits.error?<ErrorState message="Gaming istorija nije dostupna." action={<Button onClick={()=>visits.refetch()}>Pokušaj ponovo</Button>}/>:<GamingVisitList visits={visits.data??[]} staff />}
          </section>}
          {hasCapability(user,'RESERVATION_READ_ALL') && <section><h3>Lista čekanja</h3>
            {queue.isLoading?<Skeleton lines={2}/>:queue.error?<ErrorState message="Lista čekanja nije dostupna." action={<Button onClick={()=>queue.refetch()}>Pokušaj ponovo</Button>}/>:!queue.data?.content.length?<p>Nema aktivnih prijava na listi čekanja.</p>:<>
              <ul className="history-list">{queue.data.content.map(entry=><li key={entry.id}><strong>{entry.serviceName}</strong><span>{formatBusinessDateTime(entry.desiredStart)}</span><Badge tone={entry.status==='OFFERED'?'success':'warning'}>{entry.status==='OFFERED'?'Ponuda poslata':'Čeka termin'}</Badge></li>)}</ul>
              <Link to={`/waitlist?customerId=${selectedId}`}>Sve prijave · {queue.data.totalElements}</Link></>}
          </section>}
          {canManageCrm && <section className="customer-crm"><h3>CRM beleške i tagovi</h3>
            {crmError && <p className="error-banner" role="alert">{crmError}</p>}
            <label>Pretraži CRM<input value={crmSearch} onChange={(event) => setCrmSearch(event.target.value)} /></label>
            <form onSubmit={addTag}><label>Novi tag<input maxLength={60} value={tag} onChange={(event) => setTag(event.target.value)} /></label>
              <Button type="submit" disabled={!tag.trim()}>Dodaj tag</Button></form>
            <div className="form-actions">{crm.data?.tags.map((value) => <Button type="button" variant="secondary" key={value}
              onClick={() => void removeTag(value)}>{value} ×</Button>)}</div>
            <form onSubmit={addNote}><label>Nova beleška<textarea maxLength={1000} value={note}
              onChange={(event) => setNote(event.target.value)} /></label><Button type="submit" disabled={!note.trim()}>Sačuvaj belešku</Button></form>
            {crm.isLoading ? <Skeleton lines={2} label="Učitavanje CRM podataka" /> : crm.error ? <ErrorState message="CRM podaci nisu dostupni." action={<Button onClick={()=>crm.refetch()}>Pokušaj ponovo</Button>}/> : crm.data?.notes.map((item) =>
              <article className="exception-row" key={item.id}><div><p>{item.body}</p><small>Zadržava se do {formatBusinessDateTime(item.expiresAt)}</small></div>
                <div className="form-actions"><Button type="button" variant="secondary" onClick={() => void editNote(item)}>Izmeni</Button>
                  <Button type="button" variant="danger" onClick={() => void removeNote(item)}>Obriši</Button></div></article>)}
          </section>}
          <section><h3>Termini</h3>{detail.data.reservations.length ? <ul className="history-list">{detail.data.reservations.map((item) =>
            <li key={item.id}><strong>{item.serviceName}</strong><span>{formatBusinessDateTime(item.startTime)} · {item.status}</span></li>)}</ul> : <p>Nema istorije termina.</p>}</section>
          <section><h3>Narudžbine</h3>{detail.data.orders.length ? <ul className="history-list">{detail.data.orders.map((item) =>
            <li key={item.id}><strong>{money.format(item.totalPrice)}</strong><span>{formatBusinessDateTime(item.createdAt)} · {item.status}</span></li>)}</ul> : <p>Nema istorije narudžbina.</p>}</section>
        </div>}
    </Drawer>
    <Modal open={createOpen} title={activation ? 'Aktivacioni podaci' : 'Novi klijent'}
      onClose={() => { setCreateOpen(false); setActivation(null) }}>
      {activation ? <div><p>Aktivacioni kod se prikazuje samo sada. Bezbedno ga predajte klijentu.</p>
        <output className="activation-secret">{activation.secret}</output>
        <p>Važi do {formatBusinessDateTime(activation.expiresAt)}.</p>
        <Button onClick={() => { setCreateOpen(false); setActivation(null) }}>Zatvori</Button></div>
        : <form className="form-grid" onSubmit={createCustomer}>
          <label>Ime<input required maxLength={120} value={customerName}
            onChange={(event) => setCustomerName(event.target.value)} /></label>
          <label>Email<input required type="email" maxLength={180} value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)} /></label>
          {customerError && <p className="error-banner" role="alert">{customerError}</p>}
          <Button type="submit" loading={busy} disabled={!customerName.trim() || !customerEmail.trim()}>Kreiraj klijenta</Button>
        </form>}
    </Modal>
    {startOpen && detail.data && <StartSessionDialog customer={detail.data.customer} onClose={()=>setStartOpen(false)} onStarted={()=>{void visits.refetch()}}/>}
    <Modal open={!!editing} title="Izmeni podatke klijenta" onClose={()=>{if(!busy)setEditing(null)}}><form className="form-grid" onSubmit={editCustomer}>
      {customerError && <p className="error-banner" role="alert">{customerError}</p>}
      <label>Ime<input required maxLength={120} disabled={busy} value={editing?.name??''} onChange={e=>setEditing(current=>current&&{...current,name:e.target.value})}/></label>
      <label>Email<input required type="email" maxLength={180} disabled={busy} value={editing?.email??''} onChange={e=>setEditing(current=>current&&{...current,email:e.target.value})}/></label>
      <Button type="submit" loading={busy}>Sačuvaj podatke</Button></form></Modal>
    <ActionDialog open={deactivating} title="Deaktiviraj klijenta" description={`${detail.data?.customer.name??''}: nalog će biti deaktiviran. ${customerError}`}
      confirmLabel="Deaktiviraj" danger loading={busy} onClose={()=>{if(!busy)setDeactivating(false)}} onConfirm={()=>void deactivateCustomer()}/>
  </main>
}
