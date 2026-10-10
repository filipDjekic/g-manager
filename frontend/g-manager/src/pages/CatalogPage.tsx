import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { catalogApi, type CatalogFilters } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useListUrlState } from '../lists/useListUrlState'
import type { CatalogItem, ItemType } from '../types/catalog.types'
import type { BulkItem } from '../types/bulk.types'
import { CatalogCard, type CatalogAction } from '../catalog/CatalogCard'
import { CatalogDetails } from '../catalog/CatalogDetails'
import { CatalogFormDialog } from '../catalog/CatalogFormDialog'
import { CatalogPagination } from '../catalog/CatalogPagination'
import { CatalogIcon } from '../catalog/CatalogPresentation'
import '../catalog/catalog.css'

const defaults = { page: '0', size: '9', type: 'SERVICE', active: '', deleted: '', search: '', minPrice: '', maxPrice: '', sort: 'name', direction: 'ASC' }
const allowed = ['page', 'size', 'type', 'active', 'deleted', 'search', 'minPrice', 'maxPrice', 'sort', 'direction'] as const

export function CatalogPage() {
  const user = useAuthStore(state => state.user)
  const canRead = hasCapability(user, 'CATALOG_READ')
  const permissions = { manage: hasCapability(user, 'CATALOG_MANAGE'), remove: hasCapability(user, 'CATALOG_DELETE'),
    restore: hasCapability(user, 'CATALOG_RESTORE'), order: hasCapability(user, 'ORDER_CREATE') }
  const url = useListUrlState(defaults, allowed), id = useId()
  const numericPage = Number(url.state.page)
  const page = Number.isFinite(numericPage) && numericPage <= 2147483647 ? Math.max(0, Math.floor(numericPage)) : 0
  const size = [9, 24, 48].includes(Number(url.state.size)) ? Number(url.state.size) : 9
  const type: ItemType = url.state.type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'
  const showDeleted = permissions.restore && url.state.deleted === 'true'
  const active = permissions.manage && ['true', 'false'].includes(url.state.active) ? url.state.active : ''
  const sort: CatalogFilters['sort'] = ['name', 'price', 'createdAt', 'type'].includes(url.state.sort) ? url.state.sort as CatalogFilters['sort'] : 'name'
  const direction = url.state.direction === 'DESC' ? 'DESC' : 'ASC'
  const [search, setSearch] = useState(url.state.search.trim())
  useEffect(() => { const timer = window.setTimeout(() => setSearch(url.state.search.trim()), 300); return () => window.clearTimeout(timer) }, [url.state.search])
  const searchPending = search !== url.state.search.trim()
  const min = url.state.minPrice === '' ? undefined : Number(url.state.minPrice)
  const max = url.state.maxPrice === '' ? undefined : Number(url.state.maxPrice)
  const priceError = (min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0))
    ? 'Cena mora biti validan broj koji nije negativan.' : min !== undefined && max !== undefined && min > max ? 'Minimalna cena ne može biti veća od maksimalne.' : ''
  const [priceOpen, setPriceOpen] = useState(Boolean(url.state.minPrice || url.state.maxPrice))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chosen, setChosen] = useState<CatalogItem | null>(null)
  const [form, setForm] = useState<{ item?: CatalogItem; imageOnly?: boolean } | null>(null)
  const [busyId, setBusyId] = useState('')
  const singleInFlight = useRef(false)
  const detailOpener = useRef<HTMLButtonElement>(null), formOpener = useRef<HTMLButtonElement>(null)
  const [bulkSummary, setBulkSummary] = useState('')
  const [bulkFailures, setBulkFailures] = useState<{ id: string; name: string; message: string }[]>([])
  const client = useQueryClient(), toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const filters: CatalogFilters = { page, size, type, active: active === '' ? undefined : active === 'true', search: search || undefined,
    minPrice: min, maxPrice: max, sort, direction }
  const list = useQuery({ queryKey: ['catalog', 'list', user?.id, showDeleted, filters], enabled: canRead && !searchPending && !priceError,
    queryFn: () => showDeleted ? catalogApi.deleted(page, size, filters) : catalogApi.list(filters) })
  const stats = useQuery({ queryKey: ['catalog', 'statistics', user?.id], queryFn: catalogApi.statistics, enabled: canRead, staleTime: 30000 })
  const result = !searchPending && !priceError ? list.data : undefined
  const scope = JSON.stringify([type, showDeleted, active, url.state.search, url.state.minPrice, url.state.maxPrice, sort, direction, page, size])
  useEffect(() => { setSelected(new Set()) }, [scope])
  useEffect(() => {
    if (result && page > Math.max(0, result.totalPages - 1)) url.set({ page: String(Math.max(0, result.totalPages - 1)) }, true)
  }, [page, result, url.set])
  const refresh = () => client.invalidateQueries({ queryKey: ['catalog'] })
  const remember = (item: CatalogItem) => {
    client.setQueryData(['catalog', 'detail', item.id], item)
    setChosen(current => current?.id === item.id ? item : current)
    void refresh()
  }
  const bulk = useMutation({ mutationFn: ({ action, items }: { action: 'ACTIVATE' | 'DEACTIVATE'; items: BulkItem[]; names: Record<string, string> }) => catalogApi.bulkActivation(action, items),
    onSuccess: (response, request) => {
      setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno od ${response.requested} stavki.`)
      setBulkFailures(response.outcomes.filter(outcome => !outcome.success).map(outcome => ({ id: outcome.id,
        name: request.names[outcome.id] ?? outcome.id, message: outcome.message })))
      setSelected(new Set()); void refresh()
      toast(response.failed ? 'Grupna akcija je završena uz neuspešne stavke.' : 'Grupna akcija je završena.', response.failed ? 'info' : 'success')
    } })
  const busy = Boolean(busyId) || bulk.isPending
  const visibleSelected = result?.content.filter(item => selected.has(item.id) && !item.deletedAt) ?? []
  function applyFilter(changes: Partial<typeof defaults>, replace = false) { url.set({ ...changes, page: '0' }, replace) }
  function openBulk(action: 'ACTIVATE' | 'DEACTIVATE') {
    if (!permissions.manage || showDeleted || busy || !visibleSelected.length) return
    const items = visibleSelected.map(({ id, version }) => ({ id, version }))
    const names = Object.fromEntries(visibleSelected.map(item => [item.id, item.name]))
    confirm({ title: action === 'ACTIVATE' ? 'Aktiviraj izabrane stavke' : 'Deaktiviraj izabrane stavke',
      description: `${items.length} stavki ${action === 'ACTIVATE' ? 'biće dostupno' : 'više neće biti dostupno'} u ponudi.`,
      variant: action === 'ACTIVATE' ? 'default' : 'warning', confirmLabel: action === 'ACTIVATE' ? 'Aktiviraj' : 'Deaktiviraj',
      onConfirm: () => bulk.mutateAsync({ action, items, names }) })
  }
  function action(item: CatalogItem, kind: CatalogAction, trigger: HTMLButtonElement) {
    if (kind === 'DETAILS') { detailOpener.current = trigger; setChosen(item); return }
    if (busy || singleInFlight.current) return
    if (kind === 'EDIT' || kind === 'IMAGE') {
      if (!permissions.manage || item.deletedAt) return
      formOpener.current = trigger; setForm({ item, imageOnly: kind === 'IMAGE' }); return
    }
    if (kind === 'DELETE' ? !permissions.remove || item.deletedAt : kind === 'RESTORE' ? !permissions.restore || !item.deletedAt : !permissions.manage || item.deletedAt) return
    const labels = { ACTIVATE: 'Aktiviraj', DEACTIVATE: 'Deaktiviraj', DELETE: 'Obriši', RESTORE: 'Vrati' }
    confirm({ title: `${labels[kind]} stavku`, confirmLabel: labels[kind],
      description: kind === 'DELETE' ? `Stavka „${item.name}“ biće premeštena u obrisane stavke.`
        : kind === 'DEACTIVATE' ? `„${item.name}“ više neće biti dostupna u ponudi.`
        : kind === 'RESTORE' ? `Vratite stavku „${item.name}“ u katalog.` : `„${item.name}“ biće dostupna u ponudi.`,
      variant: kind === 'DELETE' ? 'danger' : kind === 'DEACTIVATE' ? 'warning' : 'default',
      reasonLabel: kind === 'DELETE' ? 'Razlog brisanja' : undefined, reasonRequired: kind === 'DELETE',
      errorMessage: 'Akciju nije moguće izvršiti. Osvežite stavku i pokušajte ponovo.',
      onConfirm: async reason => {
        if (singleInFlight.current) throw new Error('Sačekajte završetak prethodne akcije.')
        singleInFlight.current = true; setBusyId(item.id)
        try {
          if (kind === 'DELETE') {
            await catalogApi.remove(item.id, reason!)
            setChosen(current => current?.id === item.id ? null : current)
            client.removeQueries({ queryKey: ['catalog', 'detail', item.id] })
          } else {
            const updated = kind === 'RESTORE' ? await catalogApi.restore(item.id)
              : kind === 'ACTIVATE' ? await catalogApi.activate(item) : await catalogApi.deactivate(item)
            remember(updated)
          }
          setSelected(current => { const next = new Set(current); next.delete(item.id); return next })
          if (kind === 'DELETE') void refresh()
          toast(kind === 'DELETE' ? 'Stavka je obrisana.' : kind === 'RESTORE' ? 'Stavka je vraćena.' : kind === 'ACTIVATE' ? 'Stavka je aktivirana.' : 'Stavka je deaktivirana.', 'success')
        } finally { singleInFlight.current = false; setBusyId('') }
      } })
  }
  if (!canRead) return <ErrorState title="Katalog nije dostupan" message="Nemate dozvolu za pregled kataloga." />
  const administrative = permissions.manage && stats.data?.administrative
  const metrics = administrative ? [
    { label: 'Ukupno usluga', value: stats.data?.serviceCount, type: 'SERVICE' as const, tone: 'blue' },
    { label: 'Aktivne usluge', value: stats.data?.activeServiceCount, type: 'SERVICE' as const, tone: 'green' },
    { label: 'Proizvodi', value: stats.data?.productCount, type: 'PRODUCT' as const, tone: 'purple' },
    { label: 'Neaktivne stavke', value: stats.data?.inactiveCount, type: 'PRODUCT' as const, tone: 'pink' },
  ] : permissions.manage && !stats.data ? [
    { label: 'Ukupno usluga', type: 'SERVICE' as const, tone: 'blue', value: undefined },
    { label: 'Aktivne usluge', type: 'SERVICE' as const, tone: 'green', value: undefined },
    { label: 'Proizvodi', type: 'PRODUCT' as const, tone: 'purple', value: undefined },
    { label: 'Neaktivne stavke', type: 'PRODUCT' as const, tone: 'pink', value: undefined },
  ] : [
    { label: 'Dostupne usluge', value: stats.data?.serviceCount, type: 'SERVICE' as const, tone: 'blue' },
    { label: 'Dostupni proizvodi', value: stats.data?.productCount, type: 'PRODUCT' as const, tone: 'purple' },
  ]
  return <main className="workspace gm-catalog-page">
    <header className="gm-catalog-header"><div className="gm-catalog-header-title"><span className="gm-catalog-header-icon"><CatalogIcon /></span>
      <div><h1>Usluge i proizvodi</h1><p>Upravljanje katalogom usluga, gaming paketa i proizvoda.</p></div></div>
      <div className="gm-catalog-header-actions">
        {permissions.restore && <Button type="button" variant="secondary" aria-pressed={showDeleted} disabled={busy}
          onClick={() => applyFilter({ deleted: showDeleted ? '' : 'true' })}>{showDeleted ? 'Vrati se u katalog' : 'Obrisane stavke'}</Button>}
        {permissions.manage && <Button type="button" className="gm-catalog-pink-button" disabled={busy} onClick={event => {
          formOpener.current = event.currentTarget; setForm({})
        }}><span aria-hidden="true">＋</span> Nova stavka</Button>}
      </div>
    </header>
    <section className={`gm-catalog-kpis${metrics.length === 2 ? ' gm-catalog-kpis--public' : ''}`} aria-label="Statistika kataloga">
      {metrics.map(metric => <article key={metric.label} className={`gm-catalog-kpi gm-catalog-kpi--${metric.tone}`}>
        <span className="gm-catalog-kpi-icon"><CatalogIcon type={metric.type} /></span><div><span>{metric.label}</span>
          {stats.isLoading ? <Skeleton lines={1} label={`Učitavanje: ${metric.label}`} /> : <strong>{metric.value == null ? '—' : metric.value.toLocaleString('sr-Latn-RS')}</strong>}</div>
      </article>)}
    </section>
    {stats.error && <div className="gm-catalog-inline-error" role="alert"><span>{apiErrorMessage(stats.error, 'Statistiku nije moguće učitati.')}</span>
      <Button type="button" variant="secondary" onClick={() => void stats.refetch()}>Pokušaj ponovo</Button></div>}
    <section className="gm-catalog-content">
      <div className="gm-catalog-list-heading"><div className="gm-catalog-tabs" role="tablist" aria-label="Tip kataloga">
        {(['SERVICE', 'PRODUCT'] as const).map(value => <button type="button" key={value} role="tab" id={`${id}-${value}`} aria-selected={type === value}
          aria-controls={`${id}-results`} tabIndex={type === value ? 0 : -1} onClick={() => applyFilter({ type: value })}
          onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); const next = event.key === 'Home' ? 'SERVICE' : event.key === 'End' ? 'PRODUCT' : value === 'SERVICE' ? 'PRODUCT' : 'SERVICE'
            applyFilter({ type: next }); document.getElementById(`${id}-${next}`)?.focus()
          } }}><CatalogIcon type={value} />{value === 'SERVICE' ? 'Usluge' : 'Proizvodi'}</button>)}
      </div>{showDeleted && <span className="gm-catalog-deleted-label">Pregled obrisanih stavki</span>}</div>
      <form className="gm-catalog-filters" onSubmit={event => event.preventDefault()}>
        <label className="gm-catalog-search" htmlFor={`${id}-search`}><span>Pretraga</span><div><CatalogIcon search />
          <Input id={`${id}-search`} type="search" placeholder="Pretraži po nazivu..." value={url.state.search}
            onChange={event => applyFilter({ search: event.target.value }, true)} /></div></label>
        {permissions.manage && <label>Status<Select value={active} onChange={event => applyFilter({ active: event.target.value })}>
          <option value="">Svi statusi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option></Select></label>}
        <label>Cena<Select value={priceOpen || min !== undefined || max !== undefined ? 'range' : 'all'} onChange={event => {
          setPriceOpen(event.target.value === 'range'); if (event.target.value === 'all') applyFilter({ minPrice: '', maxPrice: '' })
        }}><option value="all">Sve cene</option><option value="range">Raspon cena</option></Select></label>
        <label>Sortiranje<Select value={sort} onChange={event => applyFilter({ sort: event.target.value,
          direction: event.target.value === 'createdAt' ? 'DESC' : 'ASC' })}>
          <option value="name">Naziv</option><option value="price">Cena</option><option value="createdAt">Najnovije</option>
          {sort === 'type' && <option value="type">Tip</option>}</Select></label>
        <label>Smer<Select value={direction} onChange={event => applyFilter({ direction: event.target.value })}>
          <option value="ASC">{sort === 'createdAt' ? 'Najstarije prvo' : 'Rastuće'}</option><option value="DESC">{sort === 'createdAt' ? 'Najnovije prvo' : 'Opadajuće'}</option></Select></label>
        {(priceOpen || min !== undefined || max !== undefined) && <div className="gm-catalog-price-filters">
          <label>Minimalna cena (RSD)<Input type="number" min="0" step="0.01" value={url.state.minPrice}
            aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${id}-price-error` : undefined}
            onChange={event => applyFilter({ minPrice: event.target.value }, true)} /></label>
          <label>Maksimalna cena (RSD)<Input type="number" min="0" step="0.01" value={url.state.maxPrice}
            aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${id}-price-error` : undefined}
            onChange={event => applyFilter({ maxPrice: event.target.value }, true)} /></label>
          {priceError && <p className="field-error" id={`${id}-price-error`} role="alert">{priceError}</p>}
        </div>}
      </form>
      {permissions.manage && <div className="gm-catalog-saved-views"><SavedViewBar resource="CATALOG" query={url.queryObject}
        apply={query => { setPriceOpen(Boolean(query.minPrice || query.maxPrice)); url.apply({ ...query, type: query.type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE', page: '0' }) }} /></div>}
      {permissions.manage && !showDeleted && <div className="gm-catalog-selection"><SelectionBar count={visibleSelected.length} summary={bulkSummary}>
        {visibleSelected.length > 0 && <>
          <Button type="button" disabled={busy} loading={bulk.isPending} onClick={() => openBulk('ACTIVATE')}>Aktiviraj izabrane</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => openBulk('DEACTIVATE')}>Deaktiviraj izabrane</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setSelected(new Set())}>Poništi izbor</Button>
        </>}
        {bulkSummary && <Button type="button" variant="secondary" disabled={busy} onClick={() => {
          setBulkSummary(''); setBulkFailures([]); bulk.reset()
        }}>Zatvori rezultat</Button>}
      </SelectionBar></div>}
      {bulkFailures.length > 0 && <div className="gm-catalog-bulk-failures" role="alert"><strong>Stavke koje nisu promenjene</strong><ul>
        {bulkFailures.map(failure => <li key={failure.id}><strong>{failure.name}</strong>: {failure.message}</li>)}</ul></div>}
      {(list.error || bulk.error) && <ErrorState message={apiErrorMessage(list.error || bulk.error, 'Katalog nije moguće učitati.')}
        action={<Button type="button" variant="secondary" onClick={() => { bulk.reset(); void refresh() }}>Pokušaj ponovo</Button>} />}
      <section id={`${id}-results`} role="tabpanel" aria-labelledby={`${id}-${type}`} aria-busy={list.isFetching || searchPending}>
        {(list.isLoading || searchPending) && !priceError && <div className="gm-catalog-grid gm-catalog-loading" aria-label="Učitavanje kataloga">
          {Array.from({ length: Math.min(size, 9) }, (_, index) => <div className="gm-catalog-card gm-catalog-card-skeleton" key={index}>
            <div className="gm-catalog-skeleton-media" /><Skeleton lines={3} label="Učitavanje stavke" /></div>)}
        </div>}
        {result?.content.length === 0 && !list.error && <EmptyState title={showDeleted ? 'Nema obrisanih stavki' : 'Nema stavki'}
          description="Nijedna stavka ne odgovara izabranim filterima."
          action={<Button type="button" variant="secondary" onClick={() => { setPriceOpen(false); url.apply({ type, deleted: showDeleted ? 'true' : '' }) }}>Očisti filtere</Button>} />}
        {result && <div className="gm-catalog-grid">{result.content.map(item => <CatalogCard key={item.id} item={item} permissions={permissions}
          selected={selected.has(item.id)} highlighted={chosen?.id === item.id} busy={busy}
          onAction={action} onSelect={() => setSelected(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })} />)}</div>}
      </section>
      {result && <CatalogPagination page={page} size={size} totalPages={result.totalPages} totalElements={result.totalElements}
        loading={list.isFetching || busy} onPageChange={value => url.set({ page: String(value) })} onSizeChange={value => applyFilter({ size: String(value) })} />}
    </section>
    {chosen && <CatalogDetails key={chosen.id} item={chosen} permissions={permissions} canReadResources={hasCapability(user, 'RESOURCE_READ')}
      busy={busy} returnFocusRef={detailOpener} onClose={() => setChosen(null)} onAction={action} />}
    {form && permissions.manage && <CatalogFormDialog item={form.item} imageOnly={form.imageOnly} initialType={type}
      maxImageBytes={stats.data?.maxImageBytes} returnFocusRef={formOpener} onClose={() => setForm(null)} onSaved={remember} />}
    {confirmationDialog}
  </main>
}
