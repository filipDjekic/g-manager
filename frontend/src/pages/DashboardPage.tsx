import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { extractApiError } from '../auth/authApi';
import { clearToken } from '../auth/tokenStorage';
import { getMe, type User } from '../usersApi';
import { getMyOrganization, type Organization } from '../organizationApi';

export function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const user = await getMe();
        setMe(user);
        if (user.organizationId) setOrganization(await getMyOrganization());
      } catch (loadError) {
        setError(extractApiError(loadError));
      }
    }
    load();
  }, []);

  function logout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  return (
    <main className="page shell">
      <section className="workspace">
        <aside className="side-panel">
          <Link to="/dashboard" className="brand-link">G-Manager</Link>
          <nav className="side-nav">
            <Link to="/dashboard" className="active">Dashboard</Link>
            <Link to="/organization">Igraonica</Link>
            <Link to="/employees">Korisnici</Link>
            <Link to="/profile">Profil</Link>
          </nav>
          <button className="logout-button" onClick={logout}>Logout</button>
        </aside>

        <section className="content-panel">
          <div className="page-header">
            <div>
              <p className="eyebrow">Pregled sistema</p>
              <h1>{organization?.name ?? 'G-Manager'}</h1>
              <p>{organization ? `${organization.address} · ${organization.phone}` : 'Kreiraj organizaciju pre dodavanja korisnika.'}</p>
            </div>
            {me && <span className="role-pill">{me.role}</span>}
          </div>

          {error && <p className="error-box">{error}</p>}

          <div className="summary-grid">
            <article className="summary-card main-summary">
              <span>Prijavljen korisnik</span>
              <strong>{me?.name ?? '...'}</strong>
              <small>{me?.email}</small>
            </article>
            <article className="summary-card">
              <span>Organizacija</span>
              <strong>{organization?.name ?? 'Nije kreirana'}</strong>
              <small>{organization ? `ID #${organization.id}` : 'Potrebna akcija ownera'}</small>
            </article>
            <article className="summary-card">
              <span>Status naloga</span>
              <strong>{me?.active ? 'Aktivan' : 'Neaktivan'}</strong>
            </article>
          </div>

          <div className="action-grid">
            <Link to="/organization" className="action-card">
              <strong>Igraonica</strong>
              <span>Kreiranje, izmena i pregled tenant podataka.</span>
            </Link>
            <Link to="/employees" className="action-card">
              <strong>Korisnici</strong>
              <span>Dodavanje admina i zaposlenih vezanih za istu igraonicu.</span>
            </Link>
            <Link to="/profile" className="action-card">
              <strong>Profil</strong>
              <span>Podaci naloga i promena lozinke.</span>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
