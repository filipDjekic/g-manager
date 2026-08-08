import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { loginSchema } from '../auth/schemas'
import { useAuthStore } from '../auth/authStore'
import { applyApiFieldErrors } from '../common/applyApiFieldErrors'

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (user) return <Navigate to="/" replace />

  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      const response = await authApi.login(values)
      setSession(response.token, response.user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (error) {
      applyApiFieldErrors(error, form.setError, form.setFocus)
      setServerError(apiErrorMessage(error, 'Prijava trenutno nije dostupna.'))
    }
  })

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <p className="eyebrow">G-Manager</p>
        <h1>Prijava</h1>
        <label>
          Email
          <input type="email" autoComplete="email" {...form.register('email')} />
          <span className="field-error">{form.formState.errors.email?.message}</span>
        </label>
        <label>
          Lozinka
          <input type="password" autoComplete="current-password" {...form.register('password')} />
          <span className="field-error">{form.formState.errors.password?.message}</span>
        </label>
        {serverError && <div className="error-banner" role="alert">{serverError}</div>}
        <button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Prijavljivanje…' : 'Prijavi se'}
        </button>
        <p>Nemaš nalog? <Link to="/register">Registruj se</Link></p>
      </form>
    </main>
  )
}
