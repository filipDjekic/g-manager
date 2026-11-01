import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { searchApi, type SearchResourceType, type SearchResult } from '../api/searchApi'
import { Button, Input, Modal, Skeleton, Alert } from '../components/ui'
import { useGlobalSearch } from './useGlobalSearch'

const labels: Record<SearchResourceType, string> = {
  CATALOG: 'Katalog', USER: 'Korisnici', ORDER: 'Narudžbine', RESERVATION: 'Rezervacije',
  CUSTOMER: 'Klijenti', RESOURCE: 'Stanice i resursi',
}

function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLocaleLowerCase('sr').indexOf(query.toLocaleLowerCase('sr'))
  if (index < 0 || !query) return <>{text}</>
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const search = useGlobalSearch(open, query)
  const items = useMemo(() => query.trim().length >= 2 ? search.results
    : [...search.favorites, ...search.recents.filter((recent) => !search.favorites.some((favorite) => favorite.id === recent.id && favorite.type === recent.type))],
  [query, search.favorites, search.recents, search.results])
  const groups = useMemo(() => items.reduce<Record<string, SearchResult[]>>((result, item) => {
    const group = result[item.type] ?? []
    group.push(item)
    result[item.type] = group
    return result
  }, {}), [items])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(()=>{
    if (!open || !items[active]) return
    document.getElementById('search-result-'+items[active].type+'-'+items[active].id)?.scrollIntoView({block:'nearest'})
  },[open,active,items])
  async function choose(item: SearchResult) {
    if (!/^\/(?!\/)/.test(item.action.url)) { setActionError('Veza ovog rezultata nije dostupna.'); return }
    void searchApi.remember(item, false).catch(() => undefined)
    setOpen(false); setQuery('')
    navigate(item.action.url, { state: { searchReturnTo: location.pathname + location.search } })
  }
  async function toggleFavorite(item: SearchResult) {
    try {
      if (item.favorite) await searchApi.removeFavorite(item)
      else await searchApi.remember(item, true)
      setQuery(''); search.reload(); setActive(0); setActionError('')
    } catch { setActionError('Omiljenu stavku nije moguće sačuvati. Pokušajte ponovo.') }
  }

  return <>
    <Button type="button" variant="secondary" className="palette-trigger" onClick={() => setOpen(true)}
      aria-label="Globalna pretraga" aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Control+K Meta+K">
      <svg className="palette-trigger-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
      </svg>
      <span className="palette-trigger-label">Pretraži G-Manager…</span><kbd>Ctrl K</kbd>
    </Button>
    <Modal open={open} title="Globalna pretraga" onClose={() => { setOpen(false); setQuery('') }} initialFocusRef={inputRef}>
      <div className="command-palette">
        <Input ref={inputRef} role="combobox" aria-label="Pretraži G-Manager" aria-expanded="true"
          aria-controls="global-search-results" aria-autocomplete="list" aria-haspopup="grid"
          aria-activedescendant={items[active] ? `search-result-${items[active].type}-${items[active].id}` : undefined}
          value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} placeholder="Naziv, email, status ili ID…"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.max(0, Math.min(value + 1, items.length - 1))) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)) }
            if (event.key === 'Enter' && items[active]) { event.preventDefault(); void choose(items[active]) }
          }} />
        <p className="search-help">Najmanje 2 znaka · ↑↓ izbor · Enter otvara · Esc zatvara</p>
        {search.loading && <Skeleton lines={3} label="Pretraživanje" />}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {search.error && <Alert tone="danger" role="alert">{search.error}</Alert>}
        {!search.loading && !search.error && !items.length && <p className="empty-state">
          {query.trim().length >= 2 ? 'Nema dozvoljenih rezultata.' : 'Nema nedavnih ili omiljenih stavki.'}</p>}
        <div id="global-search-results" role="grid" aria-label="Rezultati pretrage">
          {Object.entries(groups).map(([type, grouped]) => <section role="rowgroup" aria-labelledby={`search-group-${type}`} key={type}>
            <div role="row"><div role="columnheader" aria-colspan={2}>
              <h3 id={`search-group-${type}`}>{labels[type as SearchResourceType]}</h3>
            </div></div>{grouped.map((item) => {
              const index = items.indexOf(item)
              return <div key={`${item.type}-${item.id}`} className="search-result" role="row" id={`search-result-${item.type}-${item.id}`} aria-selected={index === active}>
                <div role="gridcell">
                <Button variant="ghost" aria-current={index === active ? 'true' : undefined}
                  type="button" onClick={() => void choose(item)} onMouseEnter={() => setActive(index)}>
                  <strong><Highlight text={item.title} query={query.trim()} /></strong><span>{item.subtitle}</span><span>{item.action.label}</span></Button></div>
                <div role="gridcell"><Button iconOnly variant="ghost" type="button" className="favorite-button" aria-label={item.favorite ? `Ukloni ${item.title} iz omiljenih` : `Dodaj ${item.title} u omiljene`}
                  aria-pressed={item.favorite} onClick={() => void toggleFavorite(item)}>{item.favorite ? '★' : '☆'}</Button></div>
              </div>
            })}
          </section>)}
        </div>
      </div>
    </Modal>
  </>
}
