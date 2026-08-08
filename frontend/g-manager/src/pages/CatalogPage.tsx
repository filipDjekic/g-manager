import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { catalogApi } from '../api/catalogApi'
import { catalogItemSchema } from '../catalog/catalogSchema'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import type { PageResponse } from '../types/api.types'
import type { CatalogItem, CatalogItemInput, ItemType } from '../types/catalog.types'

const emptyForm: CatalogItemInput = {
  name: '',
  description: '',
  type: 'PRODUCT',
  price: 0,
}

export function CatalogPage() {
  const user = useAuthStore((state) => state.user)
  const management = hasCapability(user, 'CATALOG_MANAGE')
  const [result, setResult] = useState<PageResponse<CatalogItem> | null>(null)
  const [page, setPage] = useState(0)
  const [type, setType] = useState<ItemType | ''>('')
  const [active, setActive] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [form, setForm] = useState<CatalogItemInput>(emptyForm)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const data = showDeleted ? await catalogApi.deleted(page, 20) : await catalogApi.list({
      page,
      size: 20,
      type: type || undefined,
      active: management && active !== '' ? active === 'true' : undefined,
      search: search.trim() || undefined,
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
      sort: 'name',
      direction: 'ASC',
    })
    setResult(data)
  }, [active, management, maxPrice, minPrice, page, search, showDeleted, type])

  useEffect(() => {
    void (showDeleted ? catalogApi.deleted(page, 20) : catalogApi.list({
      page,
      size: 20,
      type: type || undefined,
      active: management && active !== '' ? active === 'true' : undefined,
      search: search.trim() || undefined,
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
      sort: 'name',
      direction: 'ASC',
    })).then(setResult).catch((cause) =>
      setError(apiErrorMessage(cause, 'Katalog nije moguće učitati.')))
  }, [active, management, maxPrice, minPrice, page, search, showDeleted, type])

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
      if (editing) {
        await catalogApi.update(editing.id, { ...parsed.data, version: editing.version })
      } else {
        await catalogApi.create(parsed.data)
      }
      resetForm()
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće sačuvati.'))
    }
  }

  async function deactivate(item: CatalogItem) {
    if (!window.confirm(`Deaktivirati “${item.name}”?`)) return
    try {
      await catalogApi.deactivate(item)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće deaktivirati.'))
    }
  }

  async function activate(item: CatalogItem) {
    try {
      await catalogApi.activate(item)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Stavku nije moguće aktivirati.'))
    }
  }

  async function remove(item: CatalogItem) {
    const reason = window.prompt(`Razlog brisanja “${item.name}”:`)?.trim()
    if (!reason) return
    try { await catalogApi.remove(item.id, reason); await load() }
    catch (cause) { setError(apiErrorMessage(cause, 'Stavku nije moguće obrisati.')) }
  }

  async function restore(item: CatalogItem) {
    if (!window.confirm(`Vratiti “${item.name}”?`)) return
    try { await catalogApi.restore(item.id); await load() }
    catch (cause) { setError(apiErrorMessage(cause, 'Stavku nije moguće vratiti.')) }
  }

  async function uploadImage(item: CatalogItem, image?: File) {
    if (!image) return
    try {
      await catalogApi.uploadImage(item, image)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Sliku nije moguće sačuvati.'))
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Ponuda</p><h1>Katalog</h1></div>
        {hasCapability(user, 'CATALOG_RESTORE') && <button type="button" className="secondary-button"
          onClick={() => { setShowDeleted(!showDeleted); setPage(0) }}>{showDeleted ? 'Aktivne stavke' : 'Obrisane stavke'}</button>}
      </div>
      {!showDeleted && <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(0); void load() }}>
        <label>Pretraga<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Tip<select value={type} onChange={(event) => { setType(event.target.value as ItemType | ''); setPage(0) }}>
          <option value="">Svi</option><option value="PRODUCT">Proizvodi</option><option value="SERVICE">Usluge</option>
        </select></label>
        <label>Minimalna cena<input type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label>
        <label>Maksimalna cena<input type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
        {management && <label>Status<select value={active} onChange={(event) => { setActive(event.target.value); setPage(0) }}>
          <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
        </select></label>}
        <button type="submit">Primeni</button>
      </form>}
      {error && <p className="error-banner" role="alert">{error}</p>}
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
        <div className="form-actions"><button type="submit">{editing ? 'Sačuvaj izmene' : 'Kreiraj'}</button>
          {editing && <button className="secondary-button" type="button" onClick={resetForm}>Odustani</button>}</div>
      </form>}
      {!result?.content.length && <p className="empty-state">Nema stavki koje odgovaraju filterima.</p>}
      <section className="catalog-grid">
        {result?.content.map((item) => <article className={`catalog-card ${item.active ? '' : 'inactive'}`} key={item.id}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <div className="catalog-image-placeholder">{item.type === 'SERVICE' ? 'Usluga' : 'Proizvod'}</div>}
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
        </article>)}
      </section>
      <div className="pagination">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
        <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
        <button type="button" disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button>
      </div>
    </main>
  )
}
