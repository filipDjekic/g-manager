import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { SavedViewBar } from '../components/lists/SavedViewBar'
import { SelectionBar } from '../components/lists/SelectionBar'
import { Button, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useListUrlState } from '../lists/useListUrlState'
import { queryKeys } from '../query/queryKeys'
import type { CreateUserRequest, UserResponse } from '../types/user.types'

interface Props { employeesOnly?: boolean }
const defaults = { page: '0', active: '', deleted: '', sort: 'createdAt', direction: 'DESC' }
const allowed = ['page', 'active', 'deleted', 'sort', 'direction'] as const
const emptyForm: CreateUserRequest = { name: '', email: '', password: '', role: 'EMPLOYEE' }

export function UserManagementPage({ employeesOnly = false }: Props) {
  const actor = useAuthStore((state) => state.user)
  const url = useListUrlState(defaults, allowed)
  const client = useQueryClient()
  const page = Math.max(0, Number(url.state.page) || 0)
  const showDeleted = url.state.deleted === 'true'
  const [form, setForm] = useState<CreateUserRequest>(emptyForm)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSummary, setBulkSummary] = useState('')
  const dirty = Object.entries(form).some(([key, value]) => value !== emptyForm[key as keyof CreateUserRequest])
  useDirtyGuard(dirty)
  const result = useQuery({ queryKey: queryKeys.users(`${employeesOnly}:${url.query}`), queryFn: () => showDeleted
    ? userApi.deleted(page, 20) : userApi.list({ page, size: 20, role: employeesOnly ? 'EMPLOYEE' : undefined,
      active: url.state.active === '' ? undefined : url.state.active === 'true' }) })
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
    const reason = window.prompt(`Razlog brisanja naloga ${user.email}:`)?.trim()
    if (!reason) return
    await userApi.remove(user.id, reason); await refresh()
  }
  async function restore(user: UserResponse) { await userApi.restore(user.id); await refresh() }
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Administracija</p><h1>{employeesOnly ? 'Zaposleni' : 'Korisnici'}</h1></div>
      {!employeesOnly && hasCapability(actor, 'USER_RESTORE') && <Button type="button" variant="secondary"
        onClick={() => url.set({ deleted: showDeleted ? '' : 'true', page: '0' })}>{showDeleted ? 'Aktivni korisnici' : 'Obrisani korisnici'}</Button>}
      <label>Status<select value={url.state.active} onChange={(event) => url.set({ active: event.target.value, page: '0' })}>
        <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
      </select></label>
    </div>
    {!employeesOnly && <SavedViewBar resource="USERS" query={url.queryObject} apply={url.apply} />}
    {error && <ErrorState message={apiErrorMessage(error, 'Operaciju nad korisnicima nije moguće izvršiti.')}
      action={<Button onClick={() => result.refetch()}>Pokušaj ponovo</Button>} />}
    {!showDeleted && <form className="panel create-user" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(form) }}>
      <h2>Novi korisnik</h2>
      <label>Ime<input value={form.name} minLength={2} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input type="email" value={form.email} required onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Početna lozinka<input type="password" minLength={8} maxLength={100} value={form.password} required onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      {actor?.role === 'OWNER' && !employeesOnly && <label>Uloga<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as CreateUserRequest['role'] })}>
        <option value="EMPLOYEE">Zaposleni</option><option value="ADMIN">Administrator</option></select></label>}
      <Button type="submit" loading={create.isPending}>Kreiraj</Button>
    </form>}
    <SelectionBar count={selected.size} summary={bulkSummary}><Button variant="danger" loading={bulk.isPending}
      onClick={() => bulk.mutate()}>Deaktiviraj izabrane</Button></SelectionBar>
    {result.isLoading ? <Skeleton lines={7} label="Učitavanje korisnika" /> : !result.data?.content.length
      ? <EmptyState title="Nema korisnika" description="Promenite filter ili kreirajte korisnika." />
      : <TableShell label="Lista korisnika"><table className="responsive-table"><thead><tr><th scope="col">Izbor</th><th scope="col">Ime</th>
        <th scope="col">Email</th><th scope="col">Uloga</th><th scope="col">Status</th><th scope="col">Akcije</th></tr></thead>
        <tbody>{result.data.content.map((user) => <tr key={user.id}><td data-label="Izbor"><input type="checkbox" checked={selected.has(user.id)}
          disabled={showDeleted || user.id === actor?.id || !user.active} onChange={() => toggle(user.id)} aria-label={`Izaberi korisnika ${user.email}`} /></td>
          <td data-label="Ime">{user.name}</td><td data-label="Email">{user.email}</td><td data-label="Uloga">{user.role}</td><td data-label="Status">{user.active ? 'Aktivan' : 'Neaktivan'}</td><td data-label="Akcije"><div className="form-actions">{showDeleted
            ? <button type="button" onClick={() => void restore(user)}>Vrati</button>
            : <>{user.active && user.id !== actor?.id && <button className="secondary-button" type="button"
              onClick={() => { if (window.confirm(`Deaktivirati nalog ${user.email}?`)) deactivate.mutate(user.id) }}>Deaktiviraj</button>}
              {user.id !== actor?.id && hasCapability(actor, 'USER_DELETE') && <button className="danger-button" type="button"
                onClick={() => void remove(user)}>Obriši</button>}</>}</div></td></tr>)}</tbody></table></TableShell>}
    <div className="pagination"><button type="button" disabled={page === 0} onClick={() => url.set({ page: String(page - 1) })}>Prethodna</button>
      <span>Strana {page + 1} od {Math.max(result.data?.totalPages ?? 1, 1)}</span>
      <button type="button" disabled={!result.data || page + 1 >= result.data.totalPages} onClick={() => url.set({ page: String(page + 1) })}>Sledeća</button></div>
  </main>
}
