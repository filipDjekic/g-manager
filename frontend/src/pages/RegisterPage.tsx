import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { extractApiError, register } from '../auth/authApi';
import { setToken } from '../auth/tokenStorage';

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (name.trim().length < 2) return setError('Name must have at least 2 characters.');
    if (!email.includes('@')) return setError('Valid email is required.');
    if (password.length < 8) return setError('Password must have at least 8 characters.');

    try {
      setLoading(true);
      const response = await register({ name: name.trim(), email: email.trim(), password });
      setToken(response.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Register</h1>
        {error && <p className="error-box">{error}</p>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <button disabled={loading}>{loading ? 'Creating account...' : 'Register'}</button>
        <p>Već imate nalog? <Link to="/login">Login</Link></p>
      </form>
    </main>
  );
}
