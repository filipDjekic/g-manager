import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Pagination, Badge, Button, Drawer, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import type { CreateUserRequest, UserResponse } from '../types/user.types'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { roleLabels } from '../components/ui/statusPresentation'

interface Props { employeesOnly?: boolean }
const defaults = { page: '0', active: '', deleted: '', sort: 'createdAt', direction: 'DESC', search: '', focus: '' }
const allowed = ['page', 'active', 'deleted', 'sort', 'direction', 'search', 'focus'] as const
const emptyForm: CreateUserRequest = { name: '', email: '', password: '', role: 'EMPLOYEE' }

export function UserManagementPage({ employeesOnly = false }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const toast = useToast()
  const actor = useAuthStore((state) => state.user)
  const url = useListUrlState(defaults, allowed)
  const client = useQueryClient()
  const page = Math.max(0, Number(url.state.page) || 0)
  const showDeleted = url.state.deleted === 'true' && hasCapability(actor, 'USER_RESTORE')
  const [form, setForm] = useState<CreateUserRequest>(emptyForm)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const dirty = Object.entries(form).some(([key, value]) => value !== emptyForm[key as keyof CreateUserRequest])
  useDirtyGuard(dirty)
  const result = useQuery({ queryKey: queryKeys.users(`${employeesOnly}:${url.query}`), queryFn: () => showDeleted
    ? userApi.deleted(page, 20) : userApi.list({ page, size: 20, role: employeesOnly ? 'EMPLOYEE' : undefined,
      search: url.state.search || undefined, sort: url.state.sort, direction: url.state.direction, active: url.state.active === '' ? undefined : url.state.active === 'true' }) })
  const focusedUser = result.data?.content.find(user => user.id === url.state.focus)
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] })
  const create = useMutation({ mutationFn: userApi.create, onSuccess: async () => {
    setForm(emptyForm); url.set({ page: '0' }); await refresh()
  } })
  const deactivate = useMutation({ mutationFn: userApi.deactivate, onSuccess: refresh })
  const bulk = useMutation({ mutationFn: () => userApi.bulkDeactivate([...selected]), onSuccess: async (response) => {
    setBulkSummary(`${response.succeeded} uspešno, ${response.failed} neuspešno.`); setSelected(new Set()); await refresh()
  } })
  const error = result.error || create.error || deactivate.error || bulk.error

  async function remove(user: UserResponse) {
    confirm({ title: 'Obriši korisnički nalog', description: `${user.name} · ${user.email}`, variant: 'danger',
      reasonLabel: 'Razlog brisanja', reasonRequired: true, confirmLabel: 'Obriši nalog', onConfirm: async (reason) => {
        await userApi.remove(user.id, reason!); await refresh(); toast('Nalog je obrisan.', 'success')
      } })
  }
  async function restore(user: UserResponse) {
    confirm({ title: 'Vrati korisnički nalog', description: `${user.name} · ${user.email}`, confirmLabel: 'Vrati nalog',
      onConfirm: async () => { await userApi.restore(user.id); await refresh(); toast('Nalog je vraćen.', 'success') } })
  }
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  return <main className="workspace">
    {confirmationDialog}
    <div className="page-heading"><div><p className="eyebrow">Administracija</p><h1>{employeesOnly ? 'Zaposleni' : 'Korisnici'}</h1></div>
      {!employeesOnly && hasCapability(actor, 'USER_RESTORE') && <Button type="button" variant="secondary"
        onClick={() => {setSelected(new Set());url.set({ deleted: showDeleted ? '' : 'true', page: '0', focus: '' })}}>{showDeleted ? 'Aktivni korisnici' : 'Obrisani korisnici'}</Button>}
    </div>
    <div className="filter-bar customer-filters">
      <label>Status<select value={url.state.active} onChange={(event) => {setSelected(new Set());url.set({ active: event.target.value, page: '0' })}}>
        <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
      </select></label>
      <label>Pretraga<input type="search" value={url.state.search} onChange={event => {setSelected(new Set());url.set({ search: event.target.value, page: '0', focus: '' })}} placeholder="Ime ili email" /></label>
    </div>
    {!employeesOnly && <SavedViewBar resource="USERS" query={url.queryObject} apply={(query) => {setSelected(new Set());url.apply(query)}} />}
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad korisnicima nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    {!showDeleted && hasCapability(actor, 'USER_CREATE') && <details className="panel user-create-section"><summary>{employeesOnly ? 'Dodaj zaposlenog' : 'Dodaj korisnika'}</summary>
    <form className="create-user form-grid" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!create.isPending) create.mutate(form) }}>
      <label>Ime<input value={form.name} minLength={2} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input type="email" value={form.email} required onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Početna lozinka<input type="password" minLength={8} maxLength={100} value={form.password} required onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      {actor?.role === 'OWNER' && !employeesOnly && <label>Uloga<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as CreateUserRequest['role'] })}>
        <option value="EMPLOYEE">Zaposleni</option><option value="ADMIN">Administrator</option></select></label>}
      <Button type="submit" loading={create.isPending}>Kreiraj</Button>
    </form></details>}
    {hasCapability(actor, 'USER_DEACTIVATE') && <SelectionBar count={selected.size} summary={bulkSummary}><Button variant="danger" loading={bulk.isPending}
      onClick={() => confirm({ title: 'Deaktiviraj izabrane naloge', description: `${selected.size} naloga izgubiće pristup aplikaciji.`,
        variant: 'danger', confirmLabel: 'Deaktiviraj', onConfirm: () => bulk.mutateAsync() })}>Deaktiviraj izabrane</Button></SelectionBar>}
    {result.isLoading ? <Skeleton lines={7} label="Učitavanje korisnika" /> : !result.data?.content.length
      ? <EmptyState title="Nema korisnika" description="Promenite filter ili kreirajte korisnika." />
      : <TableShell label="Lista korisnika"><table className="responsive-table"><thead><tr><th scope="col">Izbor</th><th scope="col">Ime</th>
        <th scope="col">Email</th><th scope="col">Uloga</th><th scope="col">Status</th><th scope="col">Akcije</th></tr></thead>
        <tbody>{result.data.content.map((user) => <tr key={user.id}><td data-label="Izbor"><input type="checkbox" checked={selected.has(user.id)}
          disabled={showDeleted || user.id === actor?.id || !user.active || !hasCapability(actor,'USER_DEACTIVATE')} onChange={() => toggle(user.id)} aria-label={`Izaberi korisnika ${user.email}`} /></td>
          <td data-label="Ime"><button className="link-button" onClick={() => url.set({ focus: user.id })}>{user.name}</button></td><td data-label="Email">{user.email}</td><td data-label="Uloga">{roleLabels[user.role]}</td><td data-label="Status"><Badge tone={user.active?'success':'neutral'}>{user.active ? 'Aktivan' : 'Neaktivan'}</Badge></td><td data-label="Akcije"><div className="form-actions">{showDeleted
            ? <button type="button" onClick={() => void restore(user)}>Vrati</button>
            : <>{user.active && user.id !== actor?.id && hasCapability(actor,'USER_DEACTIVATE') && <button className="secondary-button" type="button"
              onClick={() => confirm({ title: 'Deaktiviraj nalog', description: `${user.name} · ${user.email}. Korisnik gubi pristup aplikaciji.`,
                variant: 'warning', confirmLabel: 'Deaktiviraj', onConfirm: () => deactivate.mutateAsync(user.id) })}>Deaktiviraj</button>}
              {user.id !== actor?.id && hasCapability(actor, 'USER_DELETE') && <button className="danger-button" type="button"
                onClick={() => void remove(user)}>Obriši</button>}</>}</div></td></tr>)}</tbody></table></TableShell>}
    <Pagination page={page} totalPages={result.data?.totalPages} onPageChange={(page) => { setSelected(new Set()); url.set({ page: String(page) }) }} loading={result.isFetching} />
    <Drawer open={!!focusedUser} title={focusedUser?.name ?? 'Korisnik'} onClose={() => url.set({ focus: '' })}>
      {focusedUser && <dl className="station-detail-grid"><div><dt>Email</dt><dd>{focusedUser.email}</dd></div><div><dt>Uloga</dt><dd>{roleLabels[focusedUser.role]}</dd></div><div><dt>Status naloga</dt><dd><Badge tone={focusedUser.active ? 'success' : 'neutral'}>{focusedUser.active ? 'Aktivan' : 'Neaktivan'}</Badge></dd></div></dl>}
    </Drawer>
  </main>
}
