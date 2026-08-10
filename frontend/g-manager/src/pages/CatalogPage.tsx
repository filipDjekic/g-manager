import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { catalogApi } from '../api/catalogApi'
import { catalogItemSchema } from '../catalog/catalogSchema'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import type { CatalogItem, CatalogItemInput, ItemType } from '../types/catalog.types'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'

const emptyForm: CatalogItemInput = {
  name: '',
  description: '',
  type: 'PRODUCT',
  price: 0,
}
const defaults = { page: '0', type: '', active: '', deleted: '', search: '', minPrice: '', maxPrice: '', sort: 'name', direction: 'ASC' }
const allowed = ['page', 'type', 'active', 'deleted', 'search', 'minPrice', 'maxPrice', 'sort', 'direction'] as const

export function CatalogPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'CATALOG_MANAGE')
  const url = useListUrlState(defaults, allowed)
  const page = Math.max(0, Number(url.state.page) || 0)
  const type = url.state.type as ItemType | ''
  const active = url.state.active
  const showDeleted = url.state.deleted === 'true'
  const search = url.state.search
  const minPrice = url.state.minPrice
  const maxPrice = url.state.maxPrice
  const [form, setForm] = useState<CatalogItemInput>(emptyForm)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const toast = useToast()
  const client = useQueryClient()
  useDirtyGuard(editing !== null || form.name !== '' || form.description !== '' || form.price !== 0)
  const listQuery = useQuery({ queryKey: queryKeys.catalog(url.query), queryFn: () => showDeleted
    ? catalogApi.deleted(page, 20) : catalogApi.list({
      page,
      size: 20,
      type: type || undefined,
      active: management && active !== '' ? active === 'true' : undefined,
      search: search.trim() || undefined,
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
      sort: url.state.sort as 'name' | 'price' | 'type' | 'createdAt',
      direction: url.state.direction as 'ASC' | 'DESC',
    }) })
  const result = listQuery.data ?? null
  const load = async () => { await client.invalidateQueries({ queryKey: ['catalog'] }) }
  const bulk = useMutation({ mutationFn: (action: 'ACTIVATE' | 'DEACTIVATE') => catalogApi.bulkActivation(action,
    (result?.content ?? []).filter(({ id }) => selected.has(id)).map(({ id, version }) => ({ id, version }))),
  onSuccess: async (response) => {
    setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`)
    setSelected(new Set()); await load()
  } })

  function startEdit(item: CatalogItem) {
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      type: item.type,
      price: item.price,
      durationMinutes: item.durationMinutes ?? undefined,
    })
  }

  function resetForm() {
    setEditing(null)
    setForm(emptyForm)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const parsed = catalogItemSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Podaci nisu validni.')
      return
    }
    try {
      setSubmitting(true)
      if (editing) {
        await catalogApi.update(editing.id, { ...parsed.data, version: editing.version })
      } else {
        await catalogApi.create(parsed.data)
      }
      resetForm()
      await load()
      toast(editing ? 'Izmene su sačuvane.' : 'Stavka je kreirana.', 'success')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće sačuvati.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deactivate(item: CatalogItem) {
    if (!window.confirm(`Deaktivirati “${item.name}”?`)) return
    try {
      await catalogApi.deactivate(item)
      await load()
      toast('Stavka je deaktivirana.', 'success')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće deaktivirati.'))
    }
  }

  async function activate(item: CatalogItem) {
    try {
      await catalogApi.activate(item)
      await load()
      toast('Stavka je aktivirana.', 'success')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće aktivirati.'))
    }
  }

  async function remove(item: CatalogItem) {
    const reason = window.prompt(`Razlog brisanja “${item.name}”:`)?.trim()
    if (!reason) return
    try {
      await catalogApi.remove(item.id, reason)
      await load()
      toast('Stavka je obrisana.', 'success')
    }
    catch (cause) { setError(apiErrorMessage(cause, 'Stavku nije moguće obrisati.')) }
  }

  async function restore(item: CatalogItem) {
    try {
      await catalogApi.restore(item.id)
      await load()
      toast('Stavka je vraćena.', 'success')
    }
    catch (cause) { setError(apiErrorMessage(cause, 'Stavku nije moguće vratiti.')) }
  }

  async function uploadImage(item: CatalogItem, image?: File) {
    if (!image) return
    try {
      await catalogApi.uploadImage(item, image)
      await load()
      toast('Slika je sačuvana.', 'success')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Sliku nije moguće sačuvati.'))
    }
  }

  return (
    <main className="workspace">
      <PageHeader eyebrow="Ponuda" title="Katalog" actions={hasCapability(user, 'CATALOG_RESTORE') &&
        <Button type="button" variant="secondary" onClick={() => url.set({ deleted: showDeleted ? '' : 'true', page: '0' })}>
          {showDeleted ? 'Aktivne stavke' : 'Obrisane stavke'}
        </Button>} />
      <SavedViewBar resource="CATALOG" query={url.queryObject} apply={url.apply} />
      {!showDeleted && <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); url.set({ page: '0' }); void load() }}>
        <label>Pretraga<input value={search} onChange={(event) => url.set({ search: event.target.value, page: '0' }, true)} /></label>
        <label>Tip<select value={type} onChange={(event) => url.set({ type: event.target.value, page: '0' })}>
          <option value="">Svi</option><option value="PRODUCT">Proizvodi</option><option value="SERVICE">Usluge</option>
        </select></label>
        <label>Minimalna cena<input type="number" min="0" step="0.01" value={minPrice} onChange={(event) => url.set({ minPrice: event.target.value, page: '0' }, true)} /></label>
        <label>Maksimalna cena<input type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => url.set({ maxPrice: event.target.value, page: '0' }, true)} /></label>
        {management && <label>Status<select value={active} onChange={(event) => url.set({ active: event.target.value, page: '0' })}>
          <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
        </select></label>}
        <button type="submit">Primeni</button>
      </form>}
      {(error || listQuery.error || bulk.error) && <ErrorState message={error || apiErrorMessage(listQuery.error || bulk.error, 'Katalog nije moguće učitati.')}
        action={<Button variant="secondary" type="button" onClick={() => void load()}>Pokušaj ponovo</Button>} />}
      {management && !showDeleted && <form className="panel catalog-form" onSubmit={submit}>
        <h2>{editing ? 'Izmeni stavku' : 'Nova stavka'}</h2>
        <label>Naziv<input maxLength={150} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Tip<select value={form.type} onChange={(event) => {
          const nextType = event.target.value as ItemType
          setForm({ ...form, type: nextType, durationMinutes: nextType === 'PRODUCT' ? undefined : form.durationMinutes })
        }}><option value="PRODUCT">Proizvod</option><option value="SERVICE">Usluga</option></select></label>
        <label>Cena<input type="number" min="0.01" step="0.01" required value={form.price || ''} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></label>
        {form.type === 'SERVICE' && <label>Trajanje (min)<input type="number" min="1" required value={form.durationMinutes ?? ''} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) || undefined })} /></label>}
        <label className="wide-field">Opis<textarea maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="form-actions"><Button type="submit" loading={submitting}>{editing ? 'Sačuvaj izmene' : 'Kreiraj'}</Button>
          {editing && <button className="secondary-button" type="button" onClick={resetForm}>Odustani</button>}</div>
      </form>}
      <SelectionBar count={selected.size} summary={bulkSummary}><Button loading={bulk.isPending}
        onClick={() => bulk.mutate('ACTIVATE')}>Aktiviraj izabrane</Button><Button variant="danger" loading={bulk.isPending}
        onClick={() => bulk.mutate('DEACTIVATE')}>Deaktiviraj izabrane</Button></SelectionBar>
      {listQuery.isLoading && <Skeleton lines={4} label="Učitavanje kataloga" />}
      {result && !result.content.length && <EmptyState title="Nema stavki" description="Nijedna stavka ne odgovara izabranim filterima."
        action={<Button variant="secondary" type="button" onClick={() => url.apply({})}>Očisti filtere</Button>} />}
      <section className="catalog-grid">
        {result?.content.map((item) => <Card className={`catalog-card ${item.active ? '' : 'inactive'}`} key={item.id}>
          {management && !showDeleted && <label className="row-selector"><input type="checkbox" checked={selected.has(item.id)}
            onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}
            aria-label={`Izaberi stavku ${item.name}`} /></label>}
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" width="640" height="384" /> : <div className="catalog-image-placeholder">{item.type === 'SERVICE' ? 'Usluga' : 'Proizvod'}</div>}
          <div className="catalog-card-body">
            <div className="catalog-card-title"><h2>{item.name}</h2><strong>{item.price.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} RSD</strong></div>
            <p>{item.description || 'Bez opisa.'}</p>
            {item.durationMinutes && <span>{item.durationMinutes} min</span>}
            {!item.active && <span className="status-badge">Neaktivno</span>}
            {hasCapability(user, 'ORDER_CREATE') && item.active && <div className="card-actions">
              {item.type === 'PRODUCT'
                ? <Link className="button-link" to="/my-orders">Dodaj u korpu</Link>
                : <Link className="button-link" to="/my-reservations">Zakaži termin</Link>}
            </div>}
            {management && <div className="card-actions">
              {showDeleted ? <button type="button" onClick={() => void restore(item)}>Vrati</button> : <>
              <button type="button" onClick={() => startEdit(item)}>Izmeni</button>
              {item.active && <button className="danger-button" type="button" onClick={() => void deactivate(item)}>Deaktiviraj</button>}
              {!item.active && <button type="button" onClick={() => void activate(item)}>Aktiviraj</button>}
              {hasCapability(user, 'CATALOG_DELETE') && <button className="danger-button" type="button" onClick={() => void remove(item)}>Obriši</button>}
              <label className="file-control">Slika<input type="file" accept="image/png,image/jpeg" onChange={(event) => void uploadImage(item, event.target.files?.[0])} /></label>
              </>}
            </div>}
          </div>
        </Card>)}
      </section>
      <div className="pagination">
        <button type="button" disabled={page === 0} onClick={() => url.set({ page: String(page - 1) })}>Prethodna</button>
        <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
        <button type="button" disabled={!result || page + 1 >= result.totalPages} onClick={() => url.set({ page: String(page + 1) })}>Sledeća</button>
      </div>
    </main>
  )
}
