import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi, type AuditCriteria, type AuditFilters } from '../api/auditApi'
import { apiErrorMessage } from '../api/client'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, Drawer, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { useListUrlState } from '../lists/useListUrlState'
import { todayInBusinessZone } from '../reservations/dateTime'
import { AuditFilterDialog } from '../audit/AuditFilterDialog'
import { AuditDetailsPanel } from '../audit/AuditDetailsPanel'
import { AuditStatisticsCards } from '../audit/AuditStatisticsCards'
import { AuditTimeline } from '../audit/AuditTimeline'
import { AuditIcon, auditDefaults, auditUrlKeys, defaultDraft, draftFromUrl, periodBounds, periodLabel, sortOptions, uuidPattern, type AuditDraft } from '../audit/auditPresentation'
import '../audit/audit.css'

export function AuditPage() {
  const actor = useAuthStore(state => state.user)
  const canRead = hasCapability(actor, 'AUDIT_READ')
  const scope = actor ? [actor.id, actor.role, actor.permissions ?? []] : null
  const url = useListUrlState(auditDefaults, auditUrlKeys)
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const filtersButton = useRef<HTMLButtonElement>(null), detailOpener = useRef<HTMLElement | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [wide, setWide] = useState(false), [search, setSearch] = useState(url.state.search)
  const [filterDialog, setFilterDialog] = useState(false), [today, setToday] = useState(todayInBusinessZone)
  const draft = draftFromUrl(url.state), bounds = periodBounds(draft, today)
  const pageNumber = Number(url.state.page)
  const page = Number.isInteger(pageNumber) && pageNumber >= 0 && pageNumber <= 2147483647 ? pageNumber : 0
  const size = [20, 50, 100].includes(Number(url.state.size)) ? Number(url.state.size) : 20
  const selected = url.state.eventId
  const criteria: AuditCriteria = { action: draft.action || undefined, resourceType: draft.resourceType || undefined,
    actorId: draft.actorId || undefined, from: bounds.from || undefined, to: bounds.to || undefined, search: url.state.search || undefined }
  const params: AuditFilters = { ...criteria, page, size, sort: draft.sort, direction: draft.direction === 'ASC' ? 'ASC' : 'DESC' }
  const advancedChanged = Object.entries(defaultDraft()).some(([key, value]) => draft[key as keyof AuditDraft] !== value)
  const activeCount = Number(!!(bounds.from || bounds.to)) + Number(!!draft.action) + Number(!!draft.resourceType)
    + Number(!!draft.actorId) + Number(draft.sort !== 'createdAt' || draft.direction !== 'DESC')

  useEffect(() => { setSearch(url.state.search) }, [url.state.search])
  useEffect(() => {
    if (search.trim() === url.state.search) return
    const timer = window.setTimeout(() => url.set({ search: search.trim(), page: '0', eventId: '' }, true), 300)
    return () => window.clearTimeout(timer)
  }, [search, url.state.search, url.set])
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayInBusinessZone()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setWide(element.getBoundingClientRect().width >= 1088)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const events = useQuery({ queryKey: ['audit', 'list', scope, params], queryFn: ({ signal }) => auditApi.list(params, signal),
    enabled: canRead, retry: false })
  const statistics = useQuery({ queryKey: ['audit', 'statistics', scope, criteria],
    queryFn: ({ signal }) => auditApi.statistics(criteria, signal), enabled: canRead, retry: false })
  const detail = useQuery({ queryKey: ['audit', 'detail', scope, selected],
    queryFn: ({ signal }) => auditApi.get(selected, signal), enabled: canRead && uuidPattern.test(selected),
    retry: false, staleTime: 0, gcTime: 0 })
  useEffect(() => {
    if (!events.isFetching && !events.isError && events.data && page >= Math.max(1, events.data.totalPages)) {
      url.set({ page: String(Math.max(0, events.data.totalPages - 1)), eventId: '' }, true)
    }
  }, [events.data, events.isFetching, events.isError, page, url.set])

  function changePage(next: number) { url.set({ page: String(next), eventId: '' }) }
  function resetFilters() { url.set({ ...defaultDraft(), page: '0', eventId: '' }) }
  function applyFilters(next: AuditDraft) { url.set({ ...next, page: '0', eventId: '' }); setFilterDialog(false) }
  function closeDetails() {
    url.set({ eventId: '' })
    window.requestAnimationFrame(() => (detailOpener.current?.isConnected ? detailOpener.current : heading.current)?.focus({ preventScroll: true }))
  }
  const detailError = selected && !uuidPattern.test(selected) ? 'ID događaja nije ispravan.'
    : detail.isError ? apiErrorMessage(detail.error, 'Detalji događaja nisu dostupni.') : undefined
  const panel = <AuditDetailsPanel event={canRead && !detail.isError && !detail.isFetching ? detail.data : undefined}
    loading={!!selected && uuidPattern.test(selected) && (detail.isPending || detail.isFetching)}
    error={detailError} retry={uuidPattern.test(selected) ? () => void detail.refetch() : undefined} onClose={closeDetails} inline={wide} />
  const result = !events.isError ? events.data : undefined
  const pages = Math.max(1, result?.totalPages ?? 1)
  const firstPage = Math.max(0, Math.min(page - 2, pages - 5))
  const visiblePages = [...new Set([0, ...Array.from({ length: Math.min(5, pages) }, (_, index) => firstPage + index), pages - 1])].sort((a, b) => a - b)
  const count = result?.totalElements ?? 0

  return <main className="workspace gm-audit" ref={root}>
    <header className="gm-audit-header"><span className="gm-audit-header-icon"><AuditIcon kind="shield" /></span>
      <div><h1 ref={heading} tabIndex={-1}>Audit</h1><p>Pregled sistemskih događaja, korisničkih aktivnosti i istorije promena.</p></div>
    </header>
    {!canRead ? <ErrorState title="Pristup nije dozvoljen" message="Nemate dozvolu za pregled audit evidencije." /> : <>
      <AuditStatisticsCards data={statistics.data} loading={statistics.isPending || statistics.isFetching}
        error={statistics.isError ? apiErrorMessage(statistics.error, 'Pokazatelji nisu dostupni.') : undefined}
        period={periodLabel(draft)} retry={() => void statistics.refetch()} />
      <div className="gm-audit-toolbar" role="search" aria-label="Pretraga audit događaja">
        <div className="gm-audit-search"><AuditIcon kind="search" />
          <Input ref={searchInput} aria-label="Pretraži audit događaje" aria-describedby="audit-search-hint" type="search"
            maxLength={160} placeholder="Pretraži događaje..." value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" className="gm-audit-search-clear" aria-label="Obriši pretragu" onClick={() => {
            setSearch(''); url.set({ search: '', page: '0', eventId: '' }, true); searchInput.current?.focus()
          }}><AuditIcon kind="close" /></button>}
        </div>
        <Button ref={filtersButton} type="button" variant="secondary" className="gm-audit-filter-button" aria-haspopup="dialog"
          aria-label={`Filteri, ${activeCount} aktivnih kriterijuma`} onClick={() => setFilterDialog(true)}><AuditIcon kind="filters" />Filteri
          {activeCount > 0 && <span className="gm-audit-filter-count" aria-hidden="true">{activeCount}</span>}
        </Button>
        <Button type="button" variant="secondary" disabled={!advancedChanged} onClick={resetFilters}><AuditIcon kind="reset" />Poništi</Button>
        <span id="audit-search-hint" className="gm-audit-sr">Pretražite akciju, tip resursa ili pun UUID resursa ili izvršioca. Pretraga ostaje sačuvana pri poništavanju filtera.</span>
      </div>
      <div className={`gm-audit-layout${wide ? ' is-wide' : ''}`}>
        <section className="gm-audit-timeline-panel" aria-label="Audit vremenska linija">
          <header className="gm-audit-list-heading"><div><h2>Vremenska linija</h2><p>{sortOptions.find(option => option.sort === draft.sort && option.direction === draft.direction)?.label} · Europe/Belgrade</p></div>
            {!events.isPending && !events.isError && <span>{new Intl.NumberFormat('sr-Latn-RS').format(count)} događaja</span>}
          </header>
          {events.isPending || events.isFetching ? <div className="gm-audit-timeline-loading"><Skeleton lines={8} label="Učitavanje audit događaja" /></div>
            : events.isError ? <ErrorState message={apiErrorMessage(events.error, 'Audit događaji nisu dostupni.')}
              action={<Button type="button" variant="secondary" onClick={() => void events.refetch()}>Pokušaj ponovo</Button>} />
              : !result?.content.length ? <EmptyState title="Nema audit događaja za izabrane kriterijume."
                description="Promenite pretragu ili upotrebite Filteri i Poništi u traci iznad." />
                : <AuditTimeline events={result.content} selected={selected} today={today} onSelect={(event, opener) => {
                  detailOpener.current = opener; url.set({ eventId: event.id })
                }} />}
          <footer className="gm-audit-pagination">
            <div className="gm-audit-page-info"><span aria-live="polite">{events.isFetching ? 'Učitavanje…' : events.isError ? 'Evidencija nije dostupna'
              : `Prikazano ${count ? page * size + 1 : 0}–${Math.min((page + 1) * size, count)} od ${count} događaja`}</span>
              <label>Događaja po strani<Select value={size} onChange={event => url.set({ size: event.target.value, page: '0', eventId: '' })}>
                {[20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
            </div>
            <nav aria-label="Stranice audit događaja"><Button type="button" variant="secondary" aria-label="Prethodna stranica"
              disabled={events.isFetching || page === 0 || !result} onClick={() => changePage(page - 1)}><AuditIcon kind="chevronLeft" /></Button>
              {visiblePages.map((number, index) => <span key={number} className="gm-audit-page-number">
                {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
                <Button type="button" variant="secondary" aria-label={`Stranica ${number + 1}`} aria-current={number === page ? 'page' : undefined}
                  disabled={events.isFetching || !result} onClick={() => changePage(number)}>{number + 1}</Button>
              </span>)}
              <Button type="button" variant="secondary" aria-label="Sledeća stranica" disabled={events.isFetching || page + 1 >= pages || !result}
                onClick={() => changePage(page + 1)}><AuditIcon kind="chevronRight" /></Button>
            </nav>
          </footer>
        </section>
        {wide && <aside className="gm-audit-details-panel" aria-label="Detalji izabranog događaja">{panel}</aside>}
      </div>
      <Drawer open={!!selected && !wide} title="Detalji događaja" size="wide" className="gm-audit-drawer" onClose={closeDetails} returnFocusRef={detailOpener}>{panel}</Drawer>
      {filterDialog && <AuditFilterDialog initial={draft} onApply={applyFilters} onClose={() => setFilterDialog(false)} returnFocusRef={filtersButton} />}
    </>}
  </main>
}
