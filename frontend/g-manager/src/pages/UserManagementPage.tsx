import { type FormEvent, useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import type { PageResponse } from '../types/api.types'
import type { CreateUserRequest, UserResponse } from '../types/user.types'

interface Props { employeesOnly?: boolean }

export function UserManagementPage({ employeesOnly = false }: Props) {
  const actor = useAuthStore((state) => state.user)
  const [result, setResult] = useState<PageResponse<UserResponse> | null>(null)
  const [page, setPage] = useState(0)
  const [active, setActive] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<CreateUserRequest>({
    name: '', email: '', password: '', role: 'EMPLOYEE',
  })

  async function load() {
    try {
      setResult(await userApi.list({
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
    void userApi.list({
      page,
      size: 20,
      role: employeesOnly ? 'EMPLOYEE' : undefined,
      active: active === '' ? undefined : active === 'true',
    }).then((data) => {
      setResult(data)
      setError('')
    }).catch((cause) => setError(apiErrorMessage(cause, 'Korisnike nije moguće učitati.')))
  }, [active, employeesOnly, page])

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

  return (
    <main className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">Administracija</p><h1>{employeesOnly ? 'Zaposleni' : 'Korisnici'}</h1></div>
        <label>Status
          <select value={active} onChange={(e) => { setActive(e.target.value); setPage(0) }}>
            <option value="">Svi</option><option value="true">Aktivni</option><option value="false">Neaktivni</option>
          </select>
        </label>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <form className="panel create-user" onSubmit={create}>
        <h2>Novi korisnik</h2>
        <label>Ime<input value={form.name} minLength={2} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Email<input type="email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Početna lozinka<input type="password" minLength={8} maxLength={100} value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {actor?.role === 'OWNER' && !employeesOnly &&
          <label>Uloga<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CreateUserRequest['role'] })}><option value="EMPLOYEE">Zaposleni</option><option value="ADMIN">Administrator</option></select></label>}
        <button type="submit">Kreiraj</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ime</th><th>Email</th><th>Uloga</th><th>Status</th><th /></tr></thead>
          <tbody>{result?.content.map((user) =>
            <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.active ? 'Aktivan' : 'Neaktivan'}</td>
              <td>{user.active && user.id !== actor?.id && <button className="danger-button" type="button" onClick={() => void deactivate(user)}>Deaktiviraj</button>}</td></tr>)}
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
