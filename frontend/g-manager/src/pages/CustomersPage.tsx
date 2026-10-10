import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { ActionDialog } from '../components/ui/ActionDialog'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { CustomerFormDialog } from '../customers/CustomerFormDialog'
import { CustomerProfile } from '../customers/CustomerProfile'
import { CustomerTable, CustomersPagination, type CustomerAction } from '../customers/CustomerTable'
import { StartSessionDialog } from '../gaming/StartSessionDialog'
import { NavigationIcon } from '../layout/NavigationIcon'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import type { CustomerListItem } from '../types/customer.types'
import '../customers/customers.css'

const defaults = { search: '', active: '', page: '0', size: '10', customerId: '' }
const allowed = ['search', 'active', 'page', 'size', 'customerId'] as const
const metrics = [
  { key: 'total', label: 'Ukupno klijenata', icon: '/customers', tone: 'blue' },
  { key: 'active', label: 'Aktivni klijenti', icon: '/sessions', tone: 'green' },
  { key: 'newThisMonth', label: 'Novi ovog meseca', icon: '/calendar', tone: 'purple' },
  { key: 'inactive', label: 'Neaktivni klijenti', icon: '/profile', tone: 'pink' },
] as const

export function CustomersPage() {
  const user = useAuthStore(state => state.user)
  const canRead = hasCapability(user, 'CUSTOMER_READ')
  const canCreate = hasCapability(user, 'CUSTOMER_CREATE')
  const canEdit = hasCapability(user, 'CUSTOMER_UPDATE_LIMITED')
  const canStart = hasCapability(user, 'GAMING_SESSION_START')
  const canDeactivate = hasCapability(user, 'CUSTOMER_DEACTIVATE')
  const client = useQueryClient()
  const url = useListUrlState(defaults, allowed)
  const requestedPage = Number(url.state.page)
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage)) : 0
  const size = [10, 20, 50].includes(Number(url.state.size)) ? Number(url.state.size) : 10
  const [search, setSearch] = useState(url.state.search)
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(url.state.search), 300)
    return () => window.clearTimeout(timer)
  }, [url.state.search])
  const searchPending = search !== url.state.search
  const active = url.state.active === '' ? undefined : url.state.active === 'true'
  const list = useQuery({ queryKey: queryKeys.customers(JSON.stringify({ search, active, page, size })),
    queryFn: () => customerApi.list({ search: search.trim() || undefined, active, page, size }), enabled: canRead && !searchPending })
  const statistics = useQuery({ queryKey: ['customers', 'statistics'], queryFn: customerApi.statistics, enabled: canRead })
  useEffect(() => {
    if (list.data && !list.isFetching && !searchPending && page >= Math.max(list.data.totalPages, 1)) {
      url.set({ page: String(Math.max(list.data.totalPages - 1, 0)) }, true)
    }
  }, [list.data, list.isFetching, page, searchPending, url.set])
  const detailOpener = useRef<HTMLButtonElement>(null)
  const createOpener = useRef<HTMLButtonElement>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerListItem | null>(null)
  const [deactivating, setDeactivating] = useState<CustomerListItem | null>(null)
  const [sessionCustomer, setSessionCustomer] = useState<CustomerListItem | null>(null)
  const [busy, setBusy] = useState(false), [startBusy, setStartBusy] = useState(false)
  const [error, setError] = useState(''), [deactivationError, setDeactivationError] = useState('')
  const inFlight = useRef(false), startInFlight = useRef(false)
  const refreshCustomers = () => {
    void client.invalidateQueries({ queryKey: ['customers'] })
    void client.invalidateQueries({ queryKey: ['gaming-customer-search'] })
  }
  const edit = (customer: CustomerListItem) => { if (canEdit) setEditing(customer) }
  const deactivate = (customer: CustomerListItem) => {
    if (!canDeactivate || !customer.active) return
    setDeactivationError(''); setDeactivating(customer)
  }
  async function start(customer: CustomerListItem) {
    if (!canStart || !customer.active || startInFlight.current) return
    startInFlight.current = true; setStartBusy(true); setError('')
    try {
      if (hasCapability(user, 'GAMING_SESSION_READ')) {
        const visits = await client.fetchQuery({ queryKey: ['gaming-visits', 'customer', customer.id],
          queryFn: () => gamingSessionApi.customerVisits(customer.id), staleTime: 0 })
        if (visits.some(visit => visit.status === 'ACTIVE')) {
          setError('Klijent već ima aktivnu gaming sesiju. Otvorite njegov profil za pregled.'); return
        }
      }
      setSessionCustomer(customer)
    } catch (cause) { setError(apiErrorMessage(cause, 'Gaming sesije klijenta nije moguće proveriti.')) }
    finally { startInFlight.current = false; setStartBusy(false) }
  }
  function action(customer: CustomerListItem, kind: CustomerAction, opener: HTMLButtonElement | null) {
    detailOpener.current = opener
    setError('')
    if (kind === 'PROFILE') url.set({ customerId: customer.id })
    else if (kind === 'EDIT') edit(customer)
    else if (kind === 'DEACTIVATE') deactivate(customer)
    else void start(customer)
  }
  async function deactivateCustomer() {
    if (!deactivating || !canDeactivate || !deactivating.active || inFlight.current) return
    inFlight.current = true; setBusy(true); setDeactivationError('')
    try {
      await customerApi.deactivate(deactivating.id)
      setDeactivating(null)
      refreshCustomers()
    } catch (cause) { setDeactivationError(apiErrorMessage(cause, 'Klijenta nije moguće deaktivirati.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (!canRead) return <main className="workspace customers-workspace"><EmptyState title="Pregled klijenata nije dostupan"
    description="Nemate dozvolu za pregled klijenata." /></main>

  return <main className="workspace customers-workspace">
    <header className="customers-heading">
      <div className="customers-heading-title"><span className="customers-title-icon"><NavigationIcon to="/customers" /></span>
        <div><h1>Klijenti</h1><p>Upravljanje klijentima, istorija aktivnosti i lojalnost.</p></div></div>
      {canCreate && <Button ref={createOpener} type="button" className="customers-pink-button" onClick={() => setCreateOpen(true)}>
        <span aria-hidden="true">+</span> Novi klijent</Button>}
    </header>
    <section className="customers-metrics" aria-label="Statistika svih klijenata">
      {metrics.map(metric => <article key={metric.key} className={`customers-metric customers-metric--${metric.tone}`}>
        <div><span>{metric.label}</span>{statistics.isLoading ? <Skeleton lines={1} label={`Učitavanje: ${metric.label}`} /> :
          <strong>{statistics.error ? '—' : statistics.data?.[metric.key]?.toLocaleString('sr-Latn-RS') ?? '—'}</strong>}</div>
        <span className="customers-metric-icon"><NavigationIcon to={metric.icon} /></span>
      </article>)}
    </section>
    {statistics.error && <div className="customers-inline-error" role="alert"><span>
      {apiErrorMessage(statistics.error, 'Statistiku klijenata nije moguće učitati.')}</span>
      <Button type="button" variant="secondary" loading={statistics.isFetching} onClick={() => void statistics.refetch()}>Pokušaj ponovo</Button></div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <section className="customers-filter-panel" aria-label="Pretraga i filteri klijenata">
      <div className="customers-filters">
        <label className="customers-search">Pretraga klijenata<div>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <Input type="search" value={url.state.search} placeholder="Pretraži po imenu, prezimenu ili email adresi…"
            onChange={event => url.set({ search: event.target.value, page: '0' }, true)} /></div></label>
        <label>Status<Select value={url.state.active} onChange={event => url.set({ active: event.target.value, page: '0' })}>
          <option value="">Svi statusi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
        </Select></label>
      </div>
      <SavedViewBar resource="CUSTOMERS" query={url.queryObject} apply={query => url.apply({ ...query, page: '0' })} />
    </section>
    <section className="customers-list" aria-label="Klijenti" aria-busy={list.isFetching || searchPending}>
      {list.isLoading || searchPending ? <div className="customers-list-skeleton"><Skeleton lines={8} label="Učitavanje klijenata" /></div> : list.error ?
        <ErrorState message={apiErrorMessage(list.error, 'Klijente nije moguće učitati.')}
          action={<Button onClick={() => void list.refetch()}>Pokušaj ponovo</Button>} /> : !list.data?.content.length ?
          <EmptyState title="Nema klijenata" description={url.state.search || url.state.active ? 'Nema rezultata za izabranu pretragu i status.' : 'Kreirani klijenti će se pojaviti ovde.'}
            action={url.state.search || url.state.active ? <Button variant="secondary" onClick={() => url.set({ search: '', active: '', page: '0' })}>Resetuj filtere</Button> : undefined} /> :
          <CustomerTable customers={list.data.content} selectedId={url.state.customerId} canEdit={canEdit}
            canStart={canStart} canDeactivate={canDeactivate} disabled={busy || startBusy} onAction={action} />}
      {list.data && !list.error && !searchPending && <CustomersPagination page={page} size={size}
        totalElements={list.data.totalElements} totalPages={list.data.totalPages} loading={list.isFetching}
        onPageChange={next => url.set({ page: String(next) })} onSizeChange={next => url.set({ size: next, page: '0' })} />}
    </section>
    {url.state.customerId && <CustomerProfile key={url.state.customerId} customerId={url.state.customerId}
      open={!sessionCustomer && !editing && !deactivating && !createOpen} onClose={() => url.set({ customerId: '' })}
      onEdit={edit} onDeactivate={deactivate} onStart={customer => void start(customer)} startBusy={startBusy} actionError={error} returnFocusRef={detailOpener} />}
    {createOpen && canCreate && <CustomerFormDialog onClose={() => setCreateOpen(false)} onSaved={refreshCustomers} returnFocusRef={createOpener} />}
    {editing && canEdit && <CustomerFormDialog customer={editing} onClose={() => setEditing(null)} onSaved={refreshCustomers} returnFocusRef={detailOpener} />}
    {sessionCustomer && canStart && <StartSessionDialog customer={sessionCustomer} onClose={() => setSessionCustomer(null)}
      onStarted={() => { void client.invalidateQueries({ queryKey: ['gaming-visits'] }); refreshCustomers() }} />}
    <ActionDialog open={!!deactivating} title="Deaktiviraj klijenta"
      description={<span className="customers-deactivation-description">{deactivating?.name ?? ''}: nalog će biti deaktiviran. Klijent neće moći da se prijavi dok je nalog neaktivan.</span>}
      confirmLabel="Deaktiviraj" danger loading={busy} onClose={() => { if (!inFlight.current) setDeactivating(null) }}
      error={deactivationError} onConfirm={deactivateCustomer} />
  </main>
}
