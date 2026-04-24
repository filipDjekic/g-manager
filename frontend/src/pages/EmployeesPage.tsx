import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { extractApiError } from '../auth/authApi';
import { createEmployee, getEmployees, getMe, setEmployeeActive, updateEmployee, type User, type Role } from '../usersApi';

type StaffRole = Extract<Role, 'ADMIN' | 'EMPLOYEE'>;
type FormState = { id?: number; name: string; email: string; password: string; role: StaffRole };
const empty: FormState = { name: '', email: '', password: '', role: 'EMPLOYEE' };

export function EmployeesPage() {
  const [me, setMe] = useState<User | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const [currentUser, team] = await Promise.all([getMe(), getEmployees()]);
    setMe(currentUser);
    setEmployees(team);
  }

  useEffect(() => {
    load().catch((loadError) => setError(extractApiError(loadError))).finally(() => setLoading(false));
  }, []);

  const canManageUsers = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const hasOrganization = Boolean(me?.organizationId);
  const activeCount = useMemo(() => employees.filter((user) => user.active).length, [employees]);
  const staffCount = useMemo(() => employees.filter((user) => user.role !== 'OWNER').length, [employees]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!canManageUsers) return setError('Nemaš dozvolu za upravljanje korisnicima.');
    if (!hasOrganization) return setError('Prvo kreiraj igraonicu.');
    if (form.name.trim().length < 2) return setError('Ime mora imati najmanje 2 karaktera.');
    if (!form.email.includes('@')) return setError('Email nije validan.');

    try {
      setSaving(true);
      if (form.id) {
        await updateEmployee(form.id, { name: form.name.trim(), email: form.email.trim(), role: form.role });
        setMessage('Korisnik je izmenjen.');
      } else {
        if (form.password.length < 8) return setError('Lozinka mora imati najmanje 8 karaktera.');
        await createEmployee({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role });
        setMessage('Korisnik je dodat i vezan za tvoju igraonicu.');
      }
      setForm(empty);
      await load();
    } catch (submitError) {
      setError(extractApiError(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(user: User) {
    setError('');
    setMessage('');
    try {
      await setEmployeeActive(user.id, !user.active);
      setMessage(user.active ? 'Korisnik je deaktiviran.' : 'Korisnik je aktiviran.');
      await load();
    } catch (toggleError) {
      setError(extractApiError(toggleError));
    }
  }

  function startEdit(user: User) {
    if (user.role === 'OWNER') return setError('Owner nalog se ne menja na ovoj strani.');
    setError('');
    setMessage('');
    setForm({ id: user.id, name: user.name, email: user.email, password: '', role: user.role as StaffRole });
  }

  return (
    <main className="page shell">
      <section className="workspace">
        <aside className="side-panel">
          <Link to="/dashboard" className="brand-link">G-Manager</Link>
          <nav className="side-nav">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/organization">Igraonica</Link>
            <Link to="/employees" className="active">Korisnici</Link>
            <Link to="/profile">Profil</Link>
          </nav>
        </aside>

        <section className="content-panel">
          <div className="page-header">
            <div>
              <p className="eyebrow">Korisnici igraonice</p>
              <h1>Tim</h1>
              <p>Svi korisnici na ovoj strani su ograničeni na tvoju organizaciju.</p>
            </div>
            {me && <span className="role-pill">{me.role}</span>}
          </div>

          {loading && <p className="info-box">Učitavanje...</p>}
          {error && <p className="error-box">{error}</p>}
          {message && <p className="success-box">{message}</p>}

          {!loading && !hasOrganization && (
            <div className="empty-state">
              <h2>Igraonica nije kreirana</h2>
              <p>Prvo napravi organizaciju, zatim dodaj admina ili zaposlenog.</p>
              <Link to="/organization" className="primary-link">Otvori igraonicu</Link>
            </div>
          )}

          {hasOrganization && (
            <>
              <div className="summary-grid compact">
                <article className="summary-card"><span>Organizacija</span><strong>{me?.organizationName}</strong></article>
                <article className="summary-card"><span>Ukupno</span><strong>{employees.length}</strong></article>
                <article className="summary-card"><span>Aktivni</span><strong>{activeCount}</strong></article>
                <article className="summary-card"><span>Staff</span><strong>{staffCount}</strong></article>
              </div>

              {canManageUsers && (
                <form className="panel-form user-form" onSubmit={submit}>
                  <div>
                    <h2>{form.id ? 'Izmena korisnika' : 'Novi korisnik'}</h2>
                    <p>Novi korisnik se automatski vezuje za organizaciju: {me?.organizationName}.</p>
                  </div>
                  <label>
                    Ime
                    <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ime i prezime" />
                  </label>
                  <label>
                    Email
                    <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="korisnik@example.com" />
                  </label>
                  {!form.id && (
                    <label>
                      Privremena lozinka
                      <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Najmanje 8 karaktera" />
                    </label>
                  )}
                  <label>
                    Rola
                    <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffRole })}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="EMPLOYEE">EMPLOYEE</option>
                    </select>
                  </label>
                  <div className="form-actions">
                    <button disabled={saving}>{saving ? 'Čuvanje...' : form.id ? 'Sačuvaj izmene' : 'Dodaj korisnika'}</button>
                    {form.id && <button type="button" className="secondary-button" onClick={() => setForm(empty)}>Otkaži</button>}
                  </div>
                </form>
              )}

              <div className="data-table">
                <div className="table-head"><span>Korisnik</span><span>Rola</span><span>Status</span><span>Organizacija</span><span>Akcije</span></div>
                {employees.map((user) => (
                  <div className="table-row" key={user.id}>
                    <span><strong>{user.name}</strong><small>{user.email}</small></span>
                    <b>{user.role}</b>
                    <b>{user.active ? 'Aktivan' : 'Neaktivan'}</b>
                    <span>{user.organizationName ?? '-'}</span>
                    <span className="row-actions">
                      {user.role !== 'OWNER' && canManageUsers && <button onClick={() => startEdit(user)}>Izmeni</button>}
                      {user.role !== 'OWNER' && canManageUsers && <button onClick={() => toggle(user)}>{user.active ? 'Deaktiviraj' : 'Aktiviraj'}</button>}
                      {user.role === 'OWNER' && <small>Owner</small>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
