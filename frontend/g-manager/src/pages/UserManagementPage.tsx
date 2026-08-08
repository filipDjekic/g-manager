import { type FormEvent, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import type { PageResponse } from '../types/api.types'
import type { CreateUserRequest, UserResponse } from '../types/user.types'

interface Props { employeesOnly?: boolean }

export function UserManagementPage({ employeesOnly = false }: Props) {
  const actor = useAuthStore((state) => state.user)
  const [result, setResult] = useState<PageResponse<UserResponse> | null>(null)
  const [page, setPage] = useState(0)
  const [active, setActive] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<CreateUserRequest>({
    name: '', email: '', password: '', role: 'EMPLOYEE',
  })

  async function load() {
    try {
      setResult(showDeleted ? await userApi.deleted(page, 20) : await userApi.list({
        page,
        size: 20,
        role: employeesOnly ? 'EMPLOYEE' : undefined,
        active: active === '' ? undefined : active === 'true',
      }))
      setError('')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Korisnike nije moguće učitati.'))
    }
  }

  useEffect(() => {
    void (showDeleted ? userApi.deleted(page, 20) : userApi.list({
      page,
      size: 20,
      role: employeesOnly ? 'EMPLOYEE' : undefined,
      active: active === '' ? undefined : active === 'true',
    })).then((data) => {
      setResult(data)
      setError('')
    }).catch((cause) => setError(apiErrorMessage(cause, 'Korisnike nije moguće učitati.')))
  }, [active, employeesOnly, page, showDeleted])

  async function create(event: FormEvent) {
    event.preventDefault()
    try {
      await userApi.create(form)
      setForm({ name: '', email: '', password: '', role: 'EMPLOYEE' })
      setPage(0)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Korisnika nije moguće kreirati.'))
    }
  }

  async function deactivate(user: UserResponse) {
    if (!window.confirm(`Deaktivirati nalog ${user.email}?`)) return
    try {
      await userApi.deactivate(user.id)
      await load()
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Korisnika nije moguće deaktivirati.'))
    }
  }

  async function remove(user: UserResponse) {
    const reason = window.prompt(`Razlog brisanja naloga ${user.email}:`)?.trim()
    if (!reason) return
    try { await userApi.remove(user.id, reason); await load() }
    catch (cause) { setError(apiErrorMessage(cause, 'Korisnika nije moguće obrisati.')) }
  }

  async function restore(user: UserResponse) {
    if (!window.confirm(`Vratiti nalog ${user.email}?`)) return
    try { await userApi.restore(user.id); await load() }
    catch (cause) { setError(apiErrorMessage(cause, 'Korisnika nije moguće vratiti.')) }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Administracija</p><h1>{employeesOnly ? 'Zaposleni' : 'Korisnici'}</h1></div>
        {!employeesOnly && hasCapability(actor, 'USER_RESTORE') && <button type="button" className="secondary-button"
          onClick={() => { setShowDeleted(!showDeleted); setPage(0) }}>{showDeleted ? 'Aktivni korisnici' : 'Obrisani korisnici'}</button>}
        <label>Status
          <select value={active} onChange={(e) => { setActive(e.target.value); setPage(0) }}>
            <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
          </select>
        </label>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {!showDeleted && <form className="panel create-user" onSubmit={create}>
        <h2>Novi korisnik</h2>
        <label>Ime<input value={form.name} minLength={2} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Email<input type="email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Početna lozinka<input type="password" minLength={8} maxLength={100} value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {actor?.role === 'OWNER' && !employeesOnly &&
          <label>Uloga<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CreateUserRequest['role'] })}><option value="EMPLOYEE">Zaposleni</option><option value="ADMIN">Administrator</option></select></label>}
        <button type="submit">Kreiraj</button>
      </form>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ime</th><th>Email</th><th>Uloga</th><th>Status</th><th /></tr></thead>
          <tbody>{result?.content.map((user) =>
            <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.active ? 'Aktivan' : 'Neaktivan'}</td>
              <td><div className="form-actions">{showDeleted
                ? <button type="button" onClick={() => void restore(user)}>Vrati</button>
                : <>{user.active && user.id !== actor?.id && <button className="secondary-button" type="button" onClick={() => void deactivate(user)}>Deaktiviraj</button>}
                  {user.id !== actor?.id && hasCapability(actor, 'USER_DELETE') && <button className="danger-button" type="button" onClick={() => void remove(user)}>Obriši</button>}</>}</div></td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Prethodna</button>
        <span>Strana {page + 1} od {Math.max(result?.totalPages ?? 1, 1)}</span>
        <button type="button" disabled={!result || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Sledeća</button>
      </div>
    </main>
  )
}
