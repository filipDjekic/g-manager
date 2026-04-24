import { FormEvent, useEffect, useState } from 'react';
import { extractApiError } from '../auth/authApi';
import { changePassword, getMe, type User } from '../usersApi';

export function ProfilePage() {
  const [me, setMe] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { getMe().then(setMe).catch((e) => setError(extractApiError(e))); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!me) return;
    if (newPassword.length < 8) return setError('Nova lozinka mora imati najmanje 8 karaktera.');
    try { await changePassword(me.id, currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setMessage('Lozinka je promenjena.'); }
    catch (e) { setError(extractApiError(e)); }
  }

  return <main className="page shell"><section className="card"><h1>Profil</h1>{error && <p className="error-box">{error}</p>}{message && <p className="success-box">{message}</p>}{me && <div className="profile-grid"><span>Ime</span><strong>{me.name}</strong><span>Email</span><strong>{me.email}</strong><span>Rola</span><strong>{me.role}</strong><span>Status</span><strong>{me.active ? 'Aktivan' : 'Neaktivan'}</strong></div>}<form className="form" onSubmit={submit}><h2>Promena lozinke</h2><input type="password" placeholder="Trenutna lozinka" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} /><input type="password" placeholder="Nova lozinka" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} /><button>Sačuvaj</button></form></section></main>;
}
