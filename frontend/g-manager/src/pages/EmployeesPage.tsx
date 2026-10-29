import { MasterDetailLayout, useContentWidth } from '../components/ui/WorkspacePatterns'
import { useResettableState } from '../components/useResettableState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton, PageHeader, PageLayout, Card } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { EmployeeLocationDialog } from '../employees/EmployeeLocationDialog'
import { EmployeeProfile } from '../employees/EmployeeProfile'
import { NewEmployeeDialog } from '../employees/NewEmployeeDialog'
import { EmployeeIcon, EmployeeKpi, EmployeePagination, EmployeesTable } from '../employees/employeePresentation'
import { employeeError, type EmployeeAction } from '../employees/employeePresentation.model'
import { useListUrlState } from '../lists/useListUrlState'
import type { AuthUser, Permission } from '../types/auth.types'
import type { BulkOperationResponse } from '../types/bulk.types'
import type { UserResponse } from '../types/user.types'
import '../employees/employees.css'

const defaults = { page: '0', size: '10', active: '', search: '', sort: 'createdAt', direction: 'DESC', focus: '' }
const allowed = ['page', 'size', 'active', 'search', 'sort', 'direction', 'focus'] as const

export function EmployeesPage() {
  const actor = useAuthStore(state => state.user)
  if (!actor || !hasCapability(actor, 'USER_LIST') || !['ADMIN', 'OWNER'].includes(actor.role)) return <PageLayout>
    <EmptyState title="Pregled zaposlenih nije dostupan" description="Nemate odgovarajuću dozvolu." />
  </PageLayout>
  return <EmployeeWorkspace key={actor.id} actor={actor} />
}

function EmployeeWorkspace({ actor }: { actor: AuthUser }) {
  const client = useQueryClient(), toast = useToast(), url = useListUrlState(defaults, allowed)
  const setUrl = url.set
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canCreate = hasCapability(actor, 'USER_CREATE'), canDeactivate = hasCapability(actor, 'USER_DEACTIVATE')
  const canDelete = hasCapability(actor, 'USER_DELETE'), canAssign = hasCapability(actor, 'RESOURCE_MANAGE')
  const canLeave = hasCapability(actor, 'WORKING_HOURS_MANAGE'), canReadResources = hasCapability(actor, 'RESOURCE_READ')
  const canChooseLocation = canAssign && canReadResources
  const canSettings = canLeave && hasCapability(actor, 'WORKING_HOURS_READ')
  const parsedPage = Number(url.state.page), page = Number.isSafeInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0
  const size = [10, 20, 50, 100].includes(Number(url.state.size)) ? Number(url.state.size) : 10
  const sort = ['name', 'email', 'createdAt', 'active', 'role'].includes(url.state.sort) ? url.state.sort : 'createdAt'
  const direction = url.state.direction === 'ASC' ? 'ASC' : 'DESC'
  const active = ['true', 'false'].includes(url.state.active) ? url.state.active === 'true' : undefined
  const [search, setSearch] = useResettableState(() => url.state.search, url.state.search), [selected, setSelected] = useResettableState<Set<string>>(() => new Set(), JSON.stringify(Object.entries(url.state).filter(([key]) => !['focus', 'reservationId', 'eventId', 'create'].includes(key))))
  const [createOpen, setCreateOpen] = useState(false), [assignEmployee, setAssignEmployee] = useState<UserResponse | null>(null)
  const [createdEmployee, setCreatedEmployee] = useState<UserResponse | null>(null), [busy, setBusy] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkOperationResponse | null>(null)
  const inFlight = useRef(false), mounted = useRef(false), rootWidth = useContentWidth()
  const createOpener = useRef<HTMLElement | null>(null), searchInput = useRef<HTMLInputElement>(null)
  const profileOpener = useRef<HTMLElement | null>(null), profileRegion = useRef<HTMLElement>(null)
  const { ref: root, wide } = rootWidth
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

useEffect(() => {
    if (search === url.state.search) return
    const timer = window.setTimeout(() => { setSelected(new Set()); setUrl({ search: search.trim(), page: '0' }, true) }, 300)
    return () => window.clearTimeout(timer)
  }, [search, url.state.search, setUrl, setSelected])
  const filters = { page, size, role: 'EMPLOYEE', active, search: url.state.search.trim() || undefined, sort, direction }
  const employees = useQuery({ queryKey: ['users', 'employees', actor.id, filters], queryFn: () => userApi.list(filters), staleTime: 15000 })
  const statistics = useQuery({ queryKey: ['users', 'employee-statistics', actor.id], queryFn: userApi.employeeStatistics,
    staleTime: 15000, refetchInterval: 60000, refetchIntervalInBackground: false, retry: false })
  const profile = useQuery({ queryKey: ['users', 'employee-profile', actor.id, url.state.focus],
    queryFn: () => userApi.employee(url.state.focus), enabled: Boolean(url.state.focus), staleTime: 15000, retry: false,
    initialData: () => employees.data?.content.find(value => value.id === url.state.focus),
    initialDataUpdatedAt: () => employees.dataUpdatedAt || undefined })
  const eligibility = employees.isSuccess ? employees.data.content.filter(value => value.active && value.id !== actor.id && value.role === 'EMPLOYEE').map(value => value.id).sort().join('|') : undefined
  const [previousEligibility, setPreviousEligibility] = useState(eligibility)
  if (eligibility !== undefined && previousEligibility !== eligibility) {
    setPreviousEligibility(eligibility)
    const eligible = new Set(eligibility.split('|'))
    setSelected(previous => new Set([...previous].filter(id => eligible.has(id))))
  }
  useEffect(() => {
    if (!employees.isSuccess) return
    if (page >= Math.max(1, employees.data.totalPages)) setUrl({ page: String(Math.max(0, employees.data.totalPages - 1)) }, true)
  }, [employees.data, employees.isSuccess, page, actor.id, setUrl])
  function current(permission: Permission) {
    const user = useAuthStore.getState().user
    return mounted.current && user?.id === actor.id && hasCapability(user, permission)
  }
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] })
  function closeProfile() {
    setUrl({ focus: '' })
    window.requestAnimationFrame(() => { const target = profileOpener.current; if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); else searchInput.current?.focus({ preventScroll: true }) })
  }
  function openProfile(employee: UserResponse, opener: HTMLButtonElement | null) {
    profileOpener.current = opener; setUrl({ focus: employee.id })
    if (wide) window.requestAnimationFrame(() => profileRegion.current?.focus({ preventScroll: true }))
  }
  function deactivate(employee: UserResponse) {
    if (!canDeactivate || !employee.active || employee.id === actor.id || inFlight.current) return
    confirm({ title: 'Deaktiviraj zaposlenog', titleIcon: <EmployeeIcon kind="lock" />, className: 'gm-employee-dialog',
      description: <><strong>{employee.name}</strong> izgubiće pristup aplikaciji. Nalog i njegova istorija ostaju sačuvani.</>,
      variant: 'warning', confirmLabel: 'Deaktiviraj nalog', formatError: cause => employeeError(cause, 'Nalog nije moguće deaktivirati.'),
      onConfirm: async () => {
        if (inFlight.current || !current('USER_DEACTIVATE')) throw new Error('Deaktivacija nije dostupna sa trenutnim dozvolama.')
        inFlight.current = true; setBusy(employee.id)
        try {
          await userApi.deactivate(employee.id)
          if (!current('USER_LIST')) return
          toast('Nalog zaposlenog je deaktiviran.', 'success')
          if (createdEmployee?.id === employee.id) setCreatedEmployee(null)
          await refresh()
        } catch (cause) { if (current('USER_LIST')) await refresh(); throw cause }
        finally { inFlight.current = false; if (mounted.current) setBusy('') }
      } })
  }
  function remove(employee: UserResponse) {
    if (!canDelete || employee.id === actor.id || inFlight.current) return
    confirm({ title: 'Obriši nalog zaposlenog', titleIcon: <EmployeeIcon kind="delete" />, className: 'gm-employee-dialog',
      description: <><strong>{employee.name}</strong> izgubiće pristup aplikaciji. Nalog će biti uklonjen iz aktivnog pregleda.</>,
      variant: 'danger', confirmLabel: 'Obriši nalog', reasonLabel: 'Razlog brisanja', reasonRequired: true,
      formatError: cause => employeeError(cause, 'Nalog nije moguće obrisati.'), onConfirm: async reason => {
        if (inFlight.current || !current('USER_DELETE')) throw new Error('Brisanje nije dostupno sa trenutnim dozvolama.')
        inFlight.current = true; setBusy(employee.id)
        try {
          await userApi.remove(employee.id, reason!)
          if (!current('USER_LIST')) return
          toast('Nalog zaposlenog je obrisan.', 'success')
          if (url.state.focus === employee.id) closeProfile()
          if (createdEmployee?.id === employee.id) setCreatedEmployee(null)
          setSelected(previous => new Set([...previous].filter(id => id !== employee.id)))
          await refresh()
          window.requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }))
        } catch (cause) { if (current('USER_LIST')) await refresh(); throw cause }
        finally { inFlight.current = false; if (mounted.current) setBusy('') }
      } })
  }
  function bulkDeactivate() {
    const ids = employees.data?.content.filter(value => selected.has(value.id) && value.active && value.id !== actor.id && value.role === 'EMPLOYEE').map(value => value.id) ?? []
    if (!canDeactivate || !ids.length || inFlight.current) return
    confirm({ title: 'Deaktiviraj izabrane zaposlene', titleIcon: <EmployeeIcon kind="lock" />, className: 'gm-employee-dialog',
      description: `${ids.length} izabranih naloga izgubiće pristup aplikaciji.`, variant: 'danger', confirmLabel: 'Deaktiviraj izabrane',
      formatError: cause => employeeError(cause, 'Grupnu deaktivaciju nije moguće izvršiti.'), onConfirm: async () => {
        if (inFlight.current || !current('USER_DEACTIVATE')) throw new Error('Grupna deaktivacija nije dostupna sa trenutnim dozvolama.')
        inFlight.current = true; setBusy('bulk')
        try {
          const response = await userApi.bulkDeactivate(ids)
          if (!current('USER_LIST')) return
          setBulkResult(response); setSelected(new Set())
          if (createdEmployee && ids.includes(createdEmployee.id)) setCreatedEmployee(null)
          toast(`${response.succeeded} uspešno, ${response.failed} neuspešno.`, response.failed ? 'info' : 'success')
          await refresh()
        } catch (cause) { if (current('USER_LIST')) await refresh(); throw cause }
        finally { inFlight.current = false; if (mounted.current) setBusy('') }
      } })
  }
  function action(employee: UserResponse, value: EmployeeAction, opener: HTMLButtonElement | null) {
    if (value === 'profile') openProfile(employee, opener)
    else if (value === 'deactivate') deactivate(employee)
    else remove(employee)
  }
  function resetFilters() { setSearch(''); setSelected(new Set()); setUrl({ search: '', active: '', sort: 'createdAt', direction: 'DESC', page: '0' }) }
  const filtered = Boolean(url.state.search || url.state.active)
  const onLeaveAvailable = canLeave && statistics.data?.onLeave !== null && statistics.data?.onLeave !== undefined
  const profileBody = profile.isLoading ? <Skeleton lines={8} label="Učitavanje profila zaposlenog" /> : profile.isError
    ? <ErrorState message={employeeError(profile.error, 'Profil zaposlenog nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => void profile.refetch()}>Pokušaj ponovo</Button>} />
    : profile.data && <EmployeeProfile employee={profile.data} actorId={actor.id} canAssignments={canAssign} canAssignLocation={canChooseLocation}
      canLeave={canLeave} canSettings={canSettings} canResourceRead={canReadResources}
      canDeactivate={canDeactivate && profile.data.active && profile.data.id !== actor.id} canDelete={canDelete && profile.data.id !== actor.id} busy={Boolean(busy)}
      onClose={closeProfile} onRefresh={() => void profile.refetch()} onDeactivate={() => { if (profile.data) deactivate(profile.data) }}
      onDelete={() => { if (profile.data) remove(profile.data) }} onAssign={() => { if (profile.data?.active) setAssignEmployee(profile.data) }} />

  return <PageLayout ref={root} className="gm-employees">
    {confirmationDialog}
    <PageHeader title="Zaposleni" description={<>Pregled zaposlenih, njihovih naloga i dostupnosti.</>} icon={<EmployeeIcon />} actions={<>{canCreate && <Button type="button" className="gm-employee-primary" aria-haspopup="dialog" aria-expanded={createOpen}
        onClick={event => { createOpener.current = event.currentTarget; setCreateOpen(true) }}><EmployeeIcon kind="add" />+ Novi zaposleni</Button>}</>} />
    <details className="ui-secondary-section"><summary>Statistika naloga</summary>    <div className="ui-stat-grid gm-employee-kpis">
      <EmployeeKpi title="Ukupno zaposlenih" kind="users" tone="blue" value={statistics.isError ? undefined : statistics.data?.total} loading={statistics.isLoading} description="Nalozi koji nisu obrisani" />
      <EmployeeKpi title="Aktivni nalozi" kind="check" tone="green" value={statistics.isError ? undefined : statistics.data?.active} loading={statistics.isLoading} description="Omogućen pristup aplikaciji" />
      <EmployeeKpi title="Novi ovog meseca" kind="calendar" tone="purple" value={statistics.isError ? undefined : statistics.data?.newThisMonth} loading={statistics.isLoading} description="Kreirani u poslovnom mesecu" />
      <EmployeeKpi title={onLeaveAvailable ? 'Na odsustvu' : 'Neaktivni nalozi'} kind={onLeaveAvailable ? 'leave' : 'lock'} tone="pink"
        value={statistics.isError ? undefined : onLeaveAvailable ? statistics.data?.onLeave ?? undefined : statistics.data?.inactive} loading={statistics.isLoading}
        description={onLeaveAvailable ? 'Jedinstveni zaposleni · odobreno danas' : 'Pristup aplikaciji je isključen'} />
    </div>
    {statistics.isError && <ErrorState message={employeeError(statistics.error, 'Statistiku zaposlenih nije moguće učitati.')}
      action={<Button type="button" variant="secondary" onClick={() => void statistics.refetch()}>Ponovo učitaj statistiku</Button>} />}
</details>
    {createdEmployee && <div className="gm-employee-created-banner" role="status"><div><strong>Zaposleni je uspešno kreiran.</strong><p>{createdEmployee.name}{canChooseLocation && ' · Dodelite postojeće resurse preko lokacije, zatim proverite konkretne dodele. Novi resursi se ne dodeljuju automatski.'}</p></div>
      {canChooseLocation && <Button type="button" variant="secondary" onClick={() => setAssignEmployee(createdEmployee)}><EmployeeIcon kind="location" />Dodeli pristup resursima</Button>}
      <Button type="button" variant="secondary" onClick={() => setCreatedEmployee(null)}>{canChooseLocation ? 'Kasnije' : 'Zatvori'}</Button></div>}
    <MasterDetailLayout inline={wide} open={!!url.state.focus} title="Profil zaposlenog" detail={profileBody} onClose={closeProfile} panelRef={profileRegion} returnFocusRef={profileOpener} panelClassName="ui-card gm-employee-profile-panel" drawerClassName="gm-employee-profile-drawer" closeDisabled={Boolean(busy)}>
      <Card className="ui-card gm-employees-list" aria-labelledby="gm-employees-list-title"><header className="gm-employees-list-heading"><h2 id="gm-employees-list-title">Pregled zaposlenih</h2>
        <Badge tone="info">Zaposleni</Badge><Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => { void employees.refetch(); void statistics.refetch() }}><EmployeeIcon kind="refresh" />Osveži</Button></header>
        <div className="ui-filter-bar gm-employee-filters"><label className="gm-employee-search"><span>Pretraga</span><div><EmployeeIcon kind="search" /><Input ref={searchInput} type="search" value={search} maxLength={200}
          placeholder="Pretraži zaposlene po imenu ili email adresi..." onChange={event => setSearch(event.target.value)} /></div></label>
          <label><span>Status naloga</span><Select value={active === undefined ? '' : String(active)} onChange={event => { setSelected(new Set()); setUrl({ active: event.target.value, page: '0' }) }}>
            <option value="">Svi statusi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option></Select></label>
          <label><span>Sortiranje</span><Select value={sort} onChange={event => setUrl({ sort: event.target.value, page: '0' })}>
            <option value="createdAt">Datum kreiranja</option><option value="name">Ime i prezime</option><option value="email">Email adresa</option><option value="active">Status naloga</option>
            {sort === 'role' && <option value="role">Uloga</option>}</Select></label>
          <label><span>Smer</span><Select value={direction} onChange={event => setUrl({ direction: event.target.value, page: '0' })}>
            <option value="ASC">{sort === 'createdAt' ? 'Najstariji prvo' : 'Rastuće'}</option><option value="DESC">{sort === 'createdAt' ? 'Najnoviji prvo' : 'Opadajuće'}</option></Select></label>
        </div>
        {filtered && <Button type="button" variant="secondary" className="gm-employee-reset" onClick={resetFilters}>Ukloni filtere</Button>}
        {canDeactivate && <SelectionBar count={selected.size} summary={bulkResult ? `${bulkResult.succeeded} uspešno, ${bulkResult.failed} neuspešno.` : undefined}>
          <Button type="button" variant="danger" loading={busy === 'bulk'} disabled={!selected.size || Boolean(busy) || employees.isError || employees.isFetching} onClick={bulkDeactivate}>Deaktiviraj izabrane</Button>
          {selected.size > 0 && <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setSelected(new Set())}>Poništi izbor</Button>}
          {bulkResult && <Button type="button" variant="secondary" onClick={() => setBulkResult(null)}>Zatvori rezultat</Button>}
        </SelectionBar>}
        {bulkResult?.failed ? <ul className="gm-employee-bulk-errors" aria-label="Neuspešne grupne akcije">{bulkResult.outcomes.filter(value => !value.success).map(value => <li key={value.id}>
          <strong>{employees.data?.content.find(employee => employee.id === value.id)?.name ?? `Nalog ${value.id.slice(0, 8)}`}</strong><span>{employeeError(new Error(value.message), 'Operacija nije uspela.')}</span></li>)}</ul> : null}
        {employees.isLoading ? <Skeleton lines={7} label="Učitavanje zaposlenih" /> : employees.isError ? <ErrorState message={employeeError(employees.error, 'Zaposlene nije moguće učitati.')}
          action={<Button variant="secondary" type="button" onClick={() => void employees.refetch()}>Pokušaj ponovo</Button>} /> : !employees.data?.content.length
            ? <EmptyState title={filtered ? 'Nema zaposlenih koji odgovaraju filterima.' : 'Nema zaposlenih.'}
              action={filtered ? <Button type="button" variant="secondary" onClick={resetFilters}>Ukloni filtere</Button> : canCreate ? <Button type="button" aria-haspopup="dialog"
                onClick={event => { createOpener.current = event.currentTarget; setCreateOpen(true) }}>Dodaj zaposlenog</Button> : undefined} />
            : <EmployeesTable employees={employees.data.content} actorId={actor.id} focus={url.state.focus} selected={selected}
              canDeactivate={canDeactivate} canDelete={canDelete} busy={Boolean(busy)} onAction={action} onToggle={id => setSelected(previous => {
                const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next
              })} />}
        {employees.isSuccess && <EmployeePagination page={page} size={size} totalPages={employees.data.totalPages} totalElements={employees.data.totalElements}
          busy={employees.isFetching || Boolean(busy)} onPage={next => { setUrl({ page: String(next) }) }} onSize={next => setUrl({ size: String(next), page: '0' })} />}
      </Card>
    </MasterDetailLayout>
    {createOpen && canCreate && <NewEmployeeDialog actorId={actor.id} returnFocusRef={createOpener} onClose={() => setCreateOpen(false)} onCreated={employee => {
      setCreateOpen(false); setCreatedEmployee(employee); setUrl({ page: '0', focus: employee.id })
      toast('Zaposleni je uspešno kreiran.', 'success'); void refresh()
      if (wide) window.requestAnimationFrame(() => profileRegion.current?.focus({ preventScroll: true }))
    }} />}
    {assignEmployee && canChooseLocation && <EmployeeLocationDialog key={assignEmployee.id} employee={assignEmployee} actorId={actor.id} onClose={() => setAssignEmployee(null)} />}
  </PageLayout>
}
