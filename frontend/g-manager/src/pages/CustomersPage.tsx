import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { Button, Drawer, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from '../reservations/dateTime'

const defaults = { search: '', active: '', page: '0', customerId: '' }
const allowed = ['search', 'active', 'page', 'customerId'] as const
const money = new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' })

export function CustomersPage() {
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
  const crm = useQuery({ queryKey: ['customers', 'crm', selectedId, crmSearch],
    queryFn: () => customerApi.crm(selectedId, crmSearch || undefined), enabled: Boolean(selectedId) })
  const close = () => url.set({ customerId: '' })

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
    <div className="page-heading"><div><p className="eyebrow">Ljudi</p><h1>Klijenti</h1></div></div>
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
    <Drawer open={Boolean(selectedId)} title={detail.data?.customer.name ?? 'Detalji klijenta'} onClose={close} returnFocusRef={detailOpener}>
      {detail.isLoading ? <Skeleton lines={6} label="Učitavanje detalja klijenta" /> : detail.error ?
        <ErrorState message={apiErrorMessage(detail.error, 'Detalje klijenta nije moguće učitati.')} action={<Button onClick={() => detail.refetch()}>Pokušaj ponovo</Button>} /> : detail.data && <div className="customer-detail">
          <p>{detail.data.customer.email}</p><p><strong>Status:</strong> {detail.data.customer.active ? 'Aktivan' : 'Neaktivan'}</p>
          <p><strong>Registrovan:</strong> {formatBusinessDateTime(detail.data.customer.registeredAt)}</p>
          <div className="customer-kpis"><article><strong>{detail.data.customer.completedAppointmentCount}</strong><span>Završeni termini</span></article>
            <article><strong>{detail.data.customer.completedOrderCount}</strong><span>Završene narudžbine</span></article>
            <article><strong>{money.format(detail.data.customer.completedOrderRevenue)}</strong><span>Ostvaren prihod</span></article></div>
          <section className="customer-crm"><h3>CRM beleške i tagovi</h3>
            {crmError && <p className="error-banner" role="alert">{crmError}</p>}
            <label>Pretraži CRM<input value={crmSearch} onChange={(event) => setCrmSearch(event.target.value)} /></label>
            <form onSubmit={addTag}><label>Novi tag<input maxLength={60} value={tag} onChange={(event) => setTag(event.target.value)} /></label>
              <Button type="submit" disabled={!tag.trim()}>Dodaj tag</Button></form>
            <div className="form-actions">{crm.data?.tags.map((value) => <Button type="button" variant="secondary" key={value}
              onClick={() => void removeTag(value)}>{value} ×</Button>)}</div>
            <form onSubmit={addNote}><label>Nova beleška<textarea maxLength={1000} value={note}
              onChange={(event) => setNote(event.target.value)} /></label><Button type="submit" disabled={!note.trim()}>Sačuvaj belešku</Button></form>
            {crm.isLoading ? <Skeleton lines={2} label="Učitavanje CRM podataka" /> : crm.data?.notes.map((item) =>
              <article className="exception-row" key={item.id}><div><p>{item.body}</p><small>Zadržava se do {formatBusinessDateTime(item.expiresAt)}</small></div>
                <div className="form-actions"><Button type="button" variant="secondary" onClick={() => void editNote(item)}>Izmeni</Button>
                  <Button type="button" variant="danger" onClick={() => void removeNote(item)}>Obriši</Button></div></article>)}
          </section>
          <section><h3>Termini</h3>{detail.data.reservations.length ? <ul className="history-list">{detail.data.reservations.map((item) =>
            <li key={item.id}><strong>{item.serviceName}</strong><span>{formatBusinessDateTime(item.startTime)} · {item.status}</span></li>)}</ul> : <p>Nema istorije termina.</p>}</section>
          <section><h3>Narudžbine</h3>{detail.data.orders.length ? <ul className="history-list">{detail.data.orders.map((item) =>
            <li key={item.id}><strong>{money.format(item.totalPrice)}</strong><span>{formatBusinessDateTime(item.createdAt)} · {item.status}</span></li>)}</ul> : <p>Nema istorije narudžbina.</p>}</section>
        </div>}
    </Drawer>
  </main>
}
