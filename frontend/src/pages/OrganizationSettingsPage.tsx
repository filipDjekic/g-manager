import { AxiosError } from 'axios';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { extractApiError } from '../auth/authApi';
import { getMe, type User } from '../usersApi';
import { createOrganization, getMyOrganization, updateMyOrganization, type Organization } from '../organizationApi';
import type { ApiErrorResponse } from '../auth/authTypes';

type FormState = { name: string; address: string; phone: string };
const empty: FormState = { name: '', address: '', phone: '' };

function isMissingOrganization(error: unknown) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError.response?.status === 400 && axiosError.response.data?.message === 'User is not assigned to an organization';
}

export function OrganizationSettingsPage() {
  const [me, setMe] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const user = await getMe();
        setMe(user);
        try {
          const org = await getMyOrganization();
          setOrganization(org);
          setForm({ name: org.name, address: org.address, phone: org.phone });
        } catch (organizationError) {
          if (!isMissingOrganization(organizationError)) setError(extractApiError(organizationError));
        }
      } catch (userError) {
        setError(extractApiError(userError));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = { name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim() };
    if (payload.name.length < 2) return setError('Naziv mora imati najmanje 2 karaktera.');
    if (payload.address.length < 2) return setError('Adresa mora imati najmanje 2 karaktera.');
    if (payload.phone.length < 3) return setError('Telefon mora imati najmanje 3 karaktera.');

    try {
      setSaving(true);
      const saved = organization ? await updateMyOrganization(payload) : await createOrganization(payload);
      setOrganization(saved);
      setMe((current) => current ? { ...current, organizationId: saved.id, organizationName: saved.name } : current);
      setForm({ name: saved.name, address: saved.address, phone: saved.phone });
      setMessage('Podaci igraonice su sačuvani.');
    } catch (saveError) {
      setError(extractApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  const canEdit = me?.role === 'OWNER';
  const hasOrganization = Boolean(organization);

  return (
    <main className="page shell">
      <section className="workspace">
        <aside className="side-panel">
          <Link to="/dashboard" className="brand-link">G-Manager</Link>
          <nav className="side-nav">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/organization" className="active">Igraonica</Link>
            <Link to="/employees">Korisnici</Link>
            <Link to="/profile">Profil</Link>
          </nav>
        </aside>

        <section className="content-panel">
          <div className="page-header">
            <div>
              <p className="eyebrow">Tenant jedinica</p>
              <h1>Igraonica</h1>
              <p>Organizacija određuje kome korisnik pripada i koji podaci su mu dostupni.</p>
            </div>
            {me && <span className="role-pill">{me.role}</span>}
          </div>

          {loading && <p className="info-box">Učitavanje...</p>}
          {error && <p className="error-box">{error}</p>}
          {message && <p className="success-box">{message}</p>}

          {!loading && !hasOrganization && canEdit && (
            <div className="empty-state">
              <h2>Nema kreirane igraonice</h2>
              <p>Kreiraj igraonicu. Tvoj nalog će automatski biti vezan za nju kao vlasnik.</p>
            </div>
          )}

          {!loading && !hasOrganization && !canEdit && (
            <div className="empty-state">
              <h2>Nalog nije vezan za igraonicu</h2>
              <p>Owner mora da kreira igraonicu i poveže korisnika sa njom.</p>
            </div>
          )}

          {organization && (
            <div className="summary-grid">
              <article className="summary-card main-summary">
                <span>Naziv</span>
                <strong>{organization.name}</strong>
                <small>ID #{organization.id}</small>
              </article>
              <article className="summary-card">
                <span>Adresa</span>
                <strong>{organization.address}</strong>
              </article>
              <article className="summary-card">
                <span>Telefon</span>
                <strong>{organization.phone}</strong>
              </article>
              <article className="summary-card">
                <span>Vlasnik</span>
                <strong>{organization.ownerName}</strong>
                <small>ID #{organization.ownerId}</small>
              </article>
            </div>
          )}

          {canEdit && (
            <form className="panel-form" onSubmit={submit}>
              <div>
                <h2>{hasOrganization ? 'Izmena podataka' : 'Kreiranje igraonice'}</h2>
                <p>{hasOrganization ? 'Ove podatke vide korisnici koji pripadaju tvojoj igraonici.' : 'Nakon čuvanja možeš da dodaješ admine i zaposlene.'}</p>
              </div>
              <label>
                Naziv igraonice
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="G Arena" />
              </label>
              <label>
                Adresa
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Glavna 10" />
              </label>
              <label>
                Telefon
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="060123456" />
              </label>
              <button disabled={saving}>{saving ? 'Čuvanje...' : hasOrganization ? 'Sačuvaj izmene' : 'Kreiraj igraonicu'}</button>
            </form>
          )}

          {!canEdit && organization && <p className="info-box">Pregled je omogućen. Izmenu podataka radi owner.</p>}
        </section>
      </section>
    </main>
  );
}
