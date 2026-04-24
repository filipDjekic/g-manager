import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { extractApiError, login } from '../auth/authApi';
import { setToken } from '../auth/tokenStorage';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const response = await login({ email: email.trim(), password });
      setToken(response.token);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Login</h1>
        {error && <p className="error-box">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
        <p>Nemate nalog? <Link to="/register">Register</Link></p>
      </form>
    </main>
  );
}
