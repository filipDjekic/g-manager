import { MasterDetailLayout } from '../components/ui/WorkspacePatterns'
import { useContentWidth } from '../components/ui/useContentWidth'
import { useResettableState } from '../components/useResettableState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton, PageHeader, PageLayout, Card } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { useListUrlState } from '../lists/useListUrlState'
import type { AuthUser, Permission, Role } from '../types/auth.types'
import type { BulkOperationResponse } from '../types/bulk.types'
import type { UserResponse } from '../types/user.types'
import { NewUserDialog } from '../users/NewUserDialog'
import { UserDetails, UserIcon, UserKpi, UserPagination, UsersTable } from '../users/userPresentation'
import { allowedUserActions, userError, type UserAction } from '../users/userPresentation.model'
import { EmployeesPage } from './EmployeesPage'
import '../users/users.css'

interface Props { employeesOnly?: boolean }
const defaults = { page: '0', size: '10', active: '', deleted: '', role: '', sort: 'createdAt', direction: 'DESC', search: '', focus: '' }
const allowed = ['page', 'size', 'active', 'deleted', 'role', 'sort', 'direction', 'search', 'focus'] as const
const roles: Role[] = ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER']
const sorting = [{ sort: 'createdAt', direction: 'DESC', label: 'Najnoviji' }, { sort: 'createdAt', direction: 'ASC', label: 'Najstariji' },
  { sort: 'name', direction: 'ASC', label: 'Ime A–Z' }, { sort: 'name', direction: 'DESC', label: 'Ime Z–A' }]

export function UserManagementPage({ employeesOnly = false }: Props) {
  const actor = useAuthStore(state => state.user)
  if (employeesOnly) return <EmployeesPage />
  if (!actor || !hasCapability(actor, 'USER_LIST') || !['OWNER', 'ADMIN'].includes(actor.role)) return <PageLayout>
    <EmptyState title="Pregled korisnika nije dostupan" description="Nemate odgovarajuću dozvolu." />
  </PageLayout>
  return <UserWorkspace key={`${actor.id}:${actor.role}`} actor={actor} />
}

function UserWorkspace({ actor }: { actor: AuthUser }) {
  const client = useQueryClient(), toast = useToast(), url = useListUrlState(defaults, allowed)
  const setUrl = url.set
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canCreate = hasCapability(actor, 'USER_CREATE') && ['OWNER', 'ADMIN'].includes(actor.role)
  const canRestore = hasCapability(actor, 'USER_RESTORE'), canDeactivate = hasCapability(actor, 'USER_DEACTIVATE')
  const deleted = url.state.deleted === 'true' && canRestore
  const pageValue = Number(url.state.page), page = Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0
  const size = [10, 20, 50, 100].includes(Number(url.state.size)) ? Number(url.state.size) : 10
  const active = ['true', 'false'].includes(url.state.active) ? url.state.active === 'true' : undefined
  const role = roles.find(value => value === url.state.role)
  const fields = url.state.sort.split(',').map(value => value.trim())
  const sortFields = ['name', 'email', 'role', 'active', 'createdAt', ...(deleted ? ['deletedAt'] : [])]
  const sort = fields.length <= 3 && fields.length > 0 && new Set(fields).size === fields.length && fields.every(value => sortFields.includes(value)) ? fields.join(',') : 'createdAt'
  const directions = url.state.direction.split(',').map(value => value.trim().toUpperCase())
  const direction = (directions.length === 1 || directions.length === sort.split(',').length) && directions.every(value => ['ASC', 'DESC'].includes(value)) ? directions.join(',') : 'DESC'
  const [search, setSearch] = useResettableState(() => url.state.search, url.state.search), [selected, setSelected] = useResettableState<Set<string>>(() => new Set(), JSON.stringify(Object.entries(url.state).filter(([key]) => !['focus', 'reservationId', 'eventId', 'create'].includes(key))))
  const [createOpen, setCreateOpen] = useState(false), [busy, setBusy] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkOperationResponse | null>(null)
  const rootWidth = useContentWidth(), detailsRegion = useRef<HTMLElement>(null), searchInput = useRef<HTMLInputElement>(null)
  const createOpener = useRef<HTMLElement | null>(null), detailsOpener = useRef<HTMLElement | null>(null)
  const mounted = useRef(false), inFlight = useRef(false)
  const { ref: root, wide } = rootWidth
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

useEffect(() => {
    if (search === url.state.search) return
    const timer = window.setTimeout(() => { setSelected(new Set()); setUrl({ search: search.trim(), page: '0' }, true) }, 300)
    return () => window.clearTimeout(timer)
  }, [search, url.state.search, setUrl, setSelected])
  const filters = { role, active, search: url.state.search.trim() || undefined, sort, direction }
  const users = useQuery({ queryKey: ['users', 'management', actor.id, actor.role, deleted, page, size, filters],
    queryFn: () => deleted ? userApi.deleted(page, size, filters) : userApi.list({ page, size, ...filters }), staleTime: 15000 })
  const statistics = useQuery({ queryKey: ['users', 'statistics', actor.id, actor.role], queryFn: userApi.statistics,
    staleTime: 15000, refetchInterval: 60000, refetchIntervalInBackground: false, retry: false })
  const detail = useQuery({ queryKey: ['users', 'detail', actor.id, actor.role, url.state.focus, deleted],
    queryFn: () => userApi.detail(url.state.focus, deleted), enabled: Boolean(url.state.focus), staleTime: 15000, retry: false,
    initialData: () => users.data?.content.find(user => user.id === url.state.focus), initialDataUpdatedAt: () => users.dataUpdatedAt || undefined })
  const eligibility = users.isSuccess ? users.data.content.filter(user => allowedUserActions(actor, user).deactivate).map(user => user.id).sort().join('|') : undefined
  const [previousEligibility, setPreviousEligibility] = useState(eligibility)
  if (eligibility !== undefined && previousEligibility !== eligibility) {
    setPreviousEligibility(eligibility)
    const eligible = new Set(eligibility.split('|'))
    setSelected(previous => new Set([...previous].filter(id => eligible.has(id))))
  }
  useEffect(() => {
    if (!users.isSuccess) return
    if (page >= Math.max(1, users.data.totalPages)) setUrl({ page: String(Math.max(0, users.data.totalPages - 1)) }, true)
  }, [users.data, users.isSuccess, actor, page, setUrl])
  function current(permission: Permission) {
    const live = useAuthStore.getState().user
    return mounted.current && live?.id === actor.id && live.role === actor.role && hasCapability(live, permission)
  }
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] })
  function closeDetails() {
    setUrl({ focus: '' })
    window.requestAnimationFrame(() => {
      const target = detailsOpener.current
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); else searchInput.current?.focus({ preventScroll: true })
    })
  }
  function openCreate(element: HTMLButtonElement) { createOpener.current = element; setCreateOpen(true) }
  function onAction(target: UserResponse, action: UserAction, opener: HTMLButtonElement | null) {
    if (action === 'details') {
      detailsOpener.current = opener; setUrl({ focus: target.id })
      if (wide) window.requestAnimationFrame(() => detailsRegion.current?.focus({ preventScroll: true }))
      return
    }
    const actions = allowedUserActions(actor, target)
    const permitted = action === 'deactivate' ? actions.deactivate : action === 'delete' ? actions.remove : actions.restore
    if (!permitted || inFlight.current) return
    const title = action === 'deactivate' ? 'Deaktiviraj korisnički nalog' : action === 'delete' ? 'Obriši korisnički nalog' : 'Vrati korisnički nalog'
    confirm({ title, titleIcon: <UserIcon kind={action === 'deactivate' ? 'lock' : action === 'delete' ? 'delete' : 'restore'} />, className: 'gm-user-dialog',
      description: <><strong>{target.name}</strong> · {target.email}. {action === 'restore' ? 'Nalog će biti vraćen u pregled postojećih korisnika.'
        : action === 'delete' ? 'Korisnik gubi pristup aplikaciji. Nalog će biti uklonjen iz aktivnog pregleda.' : 'Korisnik gubi pristup aplikaciji. Nalog i istorija ostaju sačuvani.'}</>,
      variant: action === 'delete' ? 'danger' : action === 'deactivate' ? 'warning' : 'default', confirmLabel: action === 'restore' ? 'Vrati nalog' : action === 'delete' ? 'Obriši nalog' : 'Deaktiviraj nalog',
      reasonLabel: action === 'delete' ? 'Razlog brisanja' : undefined, reasonRequired: action === 'delete',
      formatError: cause => userError(cause, 'Akciju nad nalogom nije moguće izvršiti.'), onConfirm: async reason => {
        const permission: Permission = action === 'delete' ? 'USER_DELETE' : action === 'restore' ? 'USER_RESTORE' : 'USER_DEACTIVATE'
        const live = useAuthStore.getState().user
        const liveActions = live ? allowedUserActions(live, target) : null
        if (inFlight.current || !current(permission) || !(action === 'delete' ? liveActions?.remove : action === 'restore' ? liveActions?.restore : liveActions?.deactivate))
          throw new Error('Akcija nije dostupna sa trenutnim dozvolama.')
        inFlight.current = true; setBusy(target.id)
        try {
          if (action === 'delete') await userApi.remove(target.id, reason!)
          else if (action === 'restore') await userApi.restore(target.id)
          else await userApi.deactivate(target.id)
          if (!current('USER_LIST')) return
          toast(action === 'delete' ? 'Nalog je obrisan.' : action === 'restore' ? 'Nalog je vraćen.' : 'Nalog je deaktiviran.', 'success')
          if (action !== 'deactivate' && url.state.focus === target.id) closeDetails()
          setSelected(previous => new Set([...previous].filter(id => id !== target.id)))
          await refresh()
          window.requestAnimationFrame(() => {
            if (opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus({ preventScroll: true })
            else if (wide && action === 'deactivate' && url.state.focus === target.id) detailsRegion.current?.focus({ preventScroll: true })
            else searchInput.current?.focus({ preventScroll: true })
          })
        } catch (cause) { if (current('USER_LIST')) await refresh(); throw cause }
        finally { inFlight.current = false; if (mounted.current) setBusy('') }
      } })
  }
  function bulkDeactivate() {
    const ids = users.data?.content.filter(user => selected.has(user.id) && allowedUserActions(actor, user).deactivate).map(user => user.id) ?? []
    if (!canDeactivate || deleted || !ids.length || inFlight.current) return
    confirm({ title: 'Deaktiviraj izabrane naloge', titleIcon: <UserIcon kind="lock" />, className: 'gm-user-dialog', variant: 'danger',
      description: `${ids.length} izabranih naloga izgubiće pristup aplikaciji.`, confirmLabel: 'Deaktiviraj izabrane', formatError: cause => userError(cause, 'Grupnu deaktivaciju nije moguće izvršiti.'),
      onConfirm: async () => {
        const live = useAuthStore.getState().user
        if (inFlight.current || !current('USER_DEACTIVATE') || !live || ids.some(id => {
          const target = users.data?.content.find(user => user.id === id); return !target || !allowedUserActions(live, target).deactivate
        })) throw new Error('Izbor sadrži naloge nad kojima akcija više nije dostupna.')
        inFlight.current = true; setBusy('bulk')
        try {
          const response = await userApi.bulkDeactivate(ids)
          if (!current('USER_LIST')) return
          setBulkResult(response); setSelected(new Set()); toast(`${response.succeeded} uspešno, ${response.failed} neuspešno.`, response.failed ? 'info' : 'success')
          await refresh()
        } catch (cause) { if (current('USER_LIST')) await refresh(); throw cause }
        finally { inFlight.current = false; if (mounted.current) setBusy('') }
      } })
  }
  function resetFilters() { setSearch(''); setSelected(new Set()); setUrl({ search: '', active: '', role: '', page: '0', sort: 'createdAt', direction: 'DESC' }) }
  const filtered = Boolean(url.state.search || role || active !== undefined)
  const sortValue = `${sort}:${direction}`, standardSort = sorting.some(value => `${value.sort}:${value.direction}` === sortValue)
  const detailBody = detail.isLoading ? <Skeleton lines={8} label="Učitavanje detalja korisnika" /> : detail.isError
    ? <ErrorState message={userError(detail.error, 'Detalje naloga nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => void detail.refetch()}>Pokušaj ponovo</Button>} />
    : detail.data && <UserDetails user={detail.data} actor={actor} busy={Boolean(busy)} onAction={onAction} onClose={closeDetails} onRefresh={() => void detail.refetch()} />

  return <PageLayout ref={root} className="gm-users">
    {confirmationDialog}
    <PageHeader title="Korisnici i uloge" description={<>Upravljanje nalozima, statusima i korisničkim ulogama.</>} icon={<UserIcon />} actions={<>{canCreate && <Button type="button" className="gm-user-primary" aria-haspopup="dialog" aria-expanded={createOpen} onClick={event => openCreate(event.currentTarget)}><UserIcon kind="add" />+ Novi korisnik</Button>}</>} />
    <details className="ui-secondary-section"><summary>Statistika naloga</summary>    <div className="ui-stat-grid gm-user-kpis">
      <UserKpi title="Ukupno korisnika" kind="users" tone="blue" value={statistics.isError ? undefined : statistics.data?.total} loading={statistics.isLoading} />
      <UserKpi title="Aktivni nalozi" kind="check" tone="green" value={statistics.isError ? undefined : statistics.data?.active} loading={statistics.isLoading} />
      <UserKpi title="Administratori" kind="shield" tone="purple" value={statistics.isError ? undefined : statistics.data?.administrators} loading={statistics.isLoading} />
      <UserKpi title="Neaktivni nalozi" kind="lock" tone="pink" value={statistics.isError ? undefined : statistics.data?.inactive} loading={statistics.isLoading} />
    </div>
    <p className="gm-user-note">Statistika uključuje naloge koje smete da vidite i koji nisu obrisani.</p>
    {statistics.isError && <ErrorState message={userError(statistics.error, 'Statistiku korisnika nije moguće učitati.')}
      action={<Button type="button" variant="secondary" onClick={() => void statistics.refetch()}>Ponovo učitaj statistiku</Button>} />}
</details>
    <MasterDetailLayout inline={wide} open={!!url.state.focus} title="Detalji korisnika" detail={detailBody} onClose={closeDetails} panelRef={detailsRegion} returnFocusRef={detailsOpener} panelClassName="ui-card gm-user-details-panel" drawerClassName="gm-user-details-drawer" closeDisabled={Boolean(busy)}>
      <Card className="ui-card gm-users-list" aria-labelledby="gm-users-list-title">
        <header className="gm-users-list-heading"><h2 id="gm-users-list-title">{deleted ? 'Obrisani korisnici' : 'Pregled korisnika'}</h2>
          {canRestore && <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => { setSelected(new Set()); setUrl({ deleted: deleted ? '' : 'true', page: '0', focus: '' }) }}>
            <UserIcon kind={deleted ? 'users' : 'restore'} />{deleted ? 'Postojeći korisnici' : 'Obrisani korisnici'}</Button>}
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => { void users.refetch(); void statistics.refetch(); if (url.state.focus) void detail.refetch() }}><UserIcon kind="refresh" />Osveži</Button>
        </header>
        <div className="ui-filter-bar gm-user-filters"><label className="gm-user-search"><span>Pretraga</span><div><UserIcon kind="search" /><Input ref={searchInput} type="search" maxLength={200}
          value={search} placeholder="Pretraži korisnike po imenu ili email adresi..." onChange={event => setSearch(event.target.value)} /></div></label>
          <label><span>Uloga</span><Select value={role ?? ''} onChange={event => setUrl({ role: event.target.value, page: '0' })}><option value="">Sve uloge</option>
            <option value="OWNER">Vlasnik</option><option value="ADMIN">Administrator</option><option value="EMPLOYEE">Zaposleni</option><option value="CUSTOMER">Klijent</option></Select></label>
          <label><span>Status naloga</span><Select value={active === undefined ? '' : String(active)} onChange={event => setUrl({ active: event.target.value, page: '0' })}>
            <option value="">Svi statusi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option></Select></label>
          <label><span>Sortiranje</span><Select value={sortValue} onChange={event => { const option = sorting.find(value => `${value.sort}:${value.direction}` === event.target.value); if (option) setUrl({ sort: option.sort, direction: option.direction, page: '0' }) }}>
            {!standardSort && <option value={sortValue}>Sačuvano sortiranje</option>}{sorting.map(option => <option key={`${option.sort}:${option.direction}`} value={`${option.sort}:${option.direction}`}>{option.label}</option>)}</Select></label>
        </div>
        {filtered && <Button type="button" variant="secondary" className="gm-user-reset" onClick={resetFilters}>Ukloni filtere</Button>}
        <SavedViewBar resource="USERS" query={url.queryObject} apply={query => { setSelected(new Set()); url.apply(query) }} />
        {deleted && <p className="gm-user-archive-notice"><Badge tone="warning">Obrisani nalozi</Badge> Obrisani nalozi prikazuju se odvojeno od neaktivnih. Vraćanje ne menja ulogu naloga.</p>}
        {canDeactivate && <SelectionBar count={selected.size} summary={bulkResult ? `${bulkResult.succeeded} uspešno, ${bulkResult.failed} neuspešno.` : undefined}>
          <Button type="button" variant="danger" loading={busy === 'bulk'} disabled={!selected.size || Boolean(busy) || users.isFetching || users.isError || deleted} onClick={bulkDeactivate}>Deaktiviraj izabrane</Button>
          {selected.size > 0 && <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setSelected(new Set())}>Poništi izbor</Button>}
          {bulkResult && <Button type="button" variant="secondary" onClick={() => setBulkResult(null)}>Zatvori rezultat</Button>}
        </SelectionBar>}
        {bulkResult?.failed ? <ul className="gm-user-bulk-errors" aria-label="Neuspešne grupne akcije">{bulkResult.outcomes.filter(value => !value.success).map(value => <li key={value.id}>
          <strong>{users.data?.content.find(user => user.id === value.id)?.name ?? `Nalog ${value.id.slice(0, 8)}`}</strong><span>{userError(value.message, 'Operacija nije uspela.')}</span></li>)}</ul> : null}
        {users.isLoading ? <Skeleton lines={7} label="Učitavanje korisnika" /> : users.isError ? <ErrorState message={userError(users.error, 'Korisnike nije moguće učitati.')}
          action={<Button variant="secondary" type="button" onClick={() => void users.refetch()}>Pokušaj ponovo</Button>} /> : !users.data?.content.length
            ? <EmptyState title={filtered ? 'Nema korisnika koji odgovaraju izabranim filterima.' : deleted ? 'Nema obrisanih korisnika.' : 'Nema korisnika.'}
              action={filtered ? <Button type="button" variant="secondary" onClick={resetFilters}>Ukloni filtere</Button> : !deleted && canCreate ? <Button type="button" aria-haspopup="dialog" onClick={event => openCreate(event.currentTarget)}>Novi korisnik</Button> : undefined} />
            : <UsersTable users={users.data.content} actor={actor} selected={selected} focus={url.state.focus} busy={Boolean(busy)} onAction={onAction} onToggle={id => setSelected(previous => {
              const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next
            })} />}
        {users.isSuccess && <UserPagination page={page} size={size} totalPages={users.data.totalPages} totalElements={users.data.totalElements} busy={users.isFetching || Boolean(busy)}
          onPage={next => setUrl({ page: String(next) })} onSize={next => setUrl({ size: String(next), page: '0' })} />}
      </Card>
    </MasterDetailLayout>
    {createOpen && canCreate && <NewUserDialog actor={actor} returnFocusRef={createOpener} onClose={() => setCreateOpen(false)} onCreated={user => {
      setCreateOpen(false); setSearch(''); setSelected(new Set())
      setUrl({ page: '0', deleted: '', role: '', active: '', search: '', sort: 'createdAt', direction: 'DESC', focus: user.id })
      toast('Korisnik je uspešno kreiran.', 'success'); void refresh()
      if (wide) window.requestAnimationFrame(() => detailsRegion.current?.focus({ preventScroll: true }))
    }} />}
  </PageLayout>
}
